import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { Card, Pill, SectionLabel } from "@/components/ui";
import { linkChatHref } from "@/lib/integrations";

function Line({ title, detail, chip, tone }: { title: string; detail: string; chip: string; tone: "done" | "waiting" | "muted" }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col py-2.5">
        <span className="text-[14.5px] font-medium">{title}</span>
        <span className="text-[13px] text-muted">{detail}</span>
      </span>
      <Pill tone={tone}>{chip}</Pill>
    </>
  );
}

const ROW = "flex items-center gap-3 border-b border-line px-4 last:border-b-0";

/**
 * Where Textcrew can be used. The desktop and phone apps are in beta, so there is nothing to
 * download: they are only named here. The web app is the one in use; Telegram can be linked.
 */
export function DevicesBlock({ telegramLinked }: { telegramLinked?: boolean }) {
  return (
    <section aria-label="Textcrew on your devices" className="flex flex-col gap-2">
      <SectionLabel>Textcrew on your devices</SectionLabel>
      <Card>
        <ul>
          <li className={ROW}>
            <Line
              title="Web app"
              detail="You’re using it now. It works in a phone’s browser too. Add it to your home screen."
              chip="In use"
              tone="done"
            />
          </li>
          <li>
            <Link href={linkChatHref("telegram")} className={ROW}>
              <Line
                title="Telegram"
                detail={telegramLinked ? "Linked. Chat with Tex there any time." : "Link it to chat with Tex there."}
                chip={telegramLinked ? "Linked" : "Not linked"}
                tone={telegramLinked ? "done" : "muted"}
              />
              <ChevronRightIcon size={15} className="shrink-0 text-muted" />
            </Link>
          </li>
          <li className={ROW}>
            <Line title="Desktop app" detail="Not ready to download yet. Use the web app for now." chip="In beta" tone="waiting" />
          </li>
          <li className={ROW}>
            <Line title="Mobile app" detail="Not ready to download yet. Use the web app for now." chip="In beta" tone="waiting" />
          </li>
        </ul>
      </Card>
    </section>
  );
}
