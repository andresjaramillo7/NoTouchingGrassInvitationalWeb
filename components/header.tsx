import Image from "next/image";

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <Image
            src="/ntgi-logo.webp"
            alt="No Touching Grass Invitational logo"
            width={512}
            height={512}
            sizes="(min-width: 640px) 76px, 64px"
            priority
            className="h-16 w-auto rounded-md border border-line sm:h-[76px]"
          />
          <p className="text-xs leading-[1.2] font-semibold tracking-[0.03em] sm:text-[0.9375rem]">
            NO TOUCHING GRASS
            <br />
            <span className="text-muted">INVITATIONAL</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="eyebrow text-ink">2026</p>
          <p className="eyebrow mt-2 hidden text-muted min-[380px]:block">Ends Dec 31</p>
        </div>
      </div>
    </header>
  );
}
