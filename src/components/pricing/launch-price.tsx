import { cn } from "@/lib/format";

/** The regular price, crossed out and muted, beside the launch price. */
export function StruckRegularPrice({ price, className }: { price: string; className?: string }) {
  return (
    <s aria-label={`Regular price ${price}`} className={cn("font-normal text-muted decoration-1", className)}>
      {price}
    </s>
  );
}

/** A small muted tag: the regular price has never been charged. */
export function LaunchPriceTag() {
  return <p className="w-fit rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">Launch price</p>;
}
