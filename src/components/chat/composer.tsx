"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ApiError, type Attachment } from "@/lib/api/client";
import { useMe, useSendMessage, useUploadAttachment } from "@/lib/api/hooks";
import { formatBytes } from "@/lib/format";
import { CloseIcon, FileIcon, PaperclipIcon, SendIcon } from "../icons";
import { AgentFigure } from "../tex";
import { toastError } from "../toast";
import { ButtonLink, Spinner } from "../ui";
import { PRICING_PATH } from "@/lib/pricing";
import { prewarm, startsTyping } from "@/lib/prewarm";

const MAX_FILES = 5;
/** The backend refuses anything larger (413). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LENGTH = 8000;

export type ComposerHandle = { addFiles(files: File[]): void; focus(): void };

function OutOfCredits() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface px-[18px] py-3.5 shadow-[0_0_0_1px_var(--line-strong)]">
      <AgentFigure who="tex" mood="paused" glyph size={40} label="" />
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <p className="text-[14.5px] font-semibold">You’re out of credits</p>
        <p className="text-[13px] text-muted">Tex is paused and so are your automations. It picks up where it left off.</p>
      </div>
      <div className="flex items-center gap-2">
        <ButtonLink href="/settings/credits" variant="ghost" size="sm">
          Redeem a code
        </ButtonLink>
        <ButtonLink href="/settings/credits" size="sm">
          Buy a top-up
        </ButtonLink>
        <ButtonLink href={PRICING_PATH} variant="primary" size="sm">
          Upgrade
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * Where you type to Tex. Files can be attached with the paperclip or dropped on the chat.
 * `conversationId` is the web conversation that is open: the message is written in it, which makes
 * it the active one. Without it (nothing said in web chat yet) the backend picks the active one.
 *
 * Sending doesn't wait for the API: the box empties at once and the message shows in the thread as
 * "sending" (`sendMessageOptions`). If the API refuses it, the words and files come back to the box
 * (unless something new was typed meanwhile) and a toast says why.
 */
export function Composer({ ref, conversationId, placeholder = "Message Tex…" }: { ref?: Ref<ComposerHandle>; conversationId?: string; placeholder?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const send = useSendMessage();
  const upload = useUploadAttachment();

  const draft = params.get("draft");
  const [text, setText] = useState(() => draft ?? "");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // A draft handed over in the URL (a template, the welcome flow's first message) is used once. One
  // that arrives while the chat is open (the checklist's "Write") takes the place of what is typed.
  const [takenDraft, setTakenDraft] = useState(draft);
  if (draft !== takenDraft) {
    setTakenDraft(draft);
    if (draft) setText(draft);
  }
  useEffect(() => {
    if (!draft) return;
    router.replace("/");
    input.current?.focus();
  }, [draft, router]);

  // The chat is open: Tex's workspace starts waking now, so the first message doesn't wait for it.
  // Again when typing starts; at most once a minute in all (lib/prewarm.ts).
  useEffect(() => {
    prewarm();
  }, []);

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const addFiles = (picked: File[]) => {
    setFileError(null);
    const room = MAX_FILES - files.length - uploading;
    if (picked.length > room) setFileError(`Up to ${MAX_FILES} files per message.`);
    for (const file of picked.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`${file.name} is over 10 MB, the largest file Tex can take.`);
        continue;
      }
      setUploading((n) => n + 1);
      upload.mutate(file, {
        onSuccess: (attachment) => setFiles((list) => [...list, attachment]),
        onError: (error) => setFileError(error.message),
        onSettled: () => setUploading((n) => n - 1),
      });
    }
  };
  useImperativeHandle(ref, () => ({ addFiles, focus: () => input.current?.focus() }));

  const outOfCredits =
    (send.error instanceof ApiError && send.error.outOfCredits) || (me.data !== undefined && me.data.credits.balance <= 0);
  if (outOfCredits) return <OutOfCredits />;

  const canSend = text.trim().length > 0 && uploading === 0;
  const submit = () => {
    if (!canSend) return;
    const sent = { text: text.trim(), files };
    setText("");
    setFiles([]);
    setFileError(null);
    send.mutateAsync({ text: sent.text, attachments: sent.files, clientMessageId: crypto.randomUUID(), conversationId }).catch((error: unknown) => {
      // What was sent comes back to the box, unless something new is in it by now.
      setText((now) => (now.trim() ? now : sent.text));
      setFiles((now) => (now.length ? now : sent.files));
      // Out of credits: the box gives way to what to do about it, which says so.
      if (!(error instanceof ApiError && error.outOfCredits)) toastError("Couldn’t send your message", error);
    });
    input.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line-strong),0_8px_24px_-14px_rgb(21_21_21/0.25)] transition-shadow focus-within:shadow-[0_0_0_1.5px_var(--accent),0_0_0_4px_var(--accent-soft)]">
        {(files.length > 0 || uploading > 0) && (
          <ul className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pr-1 pl-2 text-[12px]">
                <FileIcon size={13} />
                <span className="max-w-[180px] truncate">{file.name}</span>
                <span className="text-muted">{formatBytes(file.sizeBytes)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((list) => list.filter((f) => f.id !== file.id))}
                  className="grid size-5 place-items-center rounded text-muted hover:bg-line hover:text-fg"
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
            {uploading > 0 && (
              <li className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-[12px] text-muted">
                <Spinner size={12} /> uploading
              </li>
            )}
          </ul>
        )}

        <div className="flex items-end gap-1 py-2 pr-2 pl-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            title="Attach files"
            onClick={() => picker.current?.click()}
            className="grid size-9 shrink-0 place-items-center rounded-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <PaperclipIcon size={17} />
          </button>
          <textarea
            ref={input}
            rows={1}
            value={text}
            maxLength={MAX_LENGTH}
            aria-label="Message Tex"
            placeholder={placeholder}
            autoFocus
            onChange={(e) => {
              if (startsTyping(text, e.target.value)) prewarm();
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-[132px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[14.5px] leading-5 outline-none placeholder:text-muted"
          />
          <button
            type="button"
            aria-label="Send"
            title="Send"
            disabled={!canSend}
            onClick={submit}
            className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-accent text-white transition-colors hover:bg-accent-dark disabled:bg-surface-2 disabled:text-muted"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </div>

      <div className="flex min-h-4 items-center justify-between gap-3 px-3">
        {fileError && (
          <p role="alert" className="text-[12.5px] text-danger">
            {fileError}
          </p>
        )}
        <span className="ml-auto text-[12px] text-muted max-md:hidden">Enter to send, Shift+Enter for a new line. Drop files anywhere.</span>
      </div>
    </div>
  );
}
