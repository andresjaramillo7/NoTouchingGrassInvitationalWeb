import { Countdown } from "@/components/countdown";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="border-b border-line px-5 py-8 sm:px-8 sm:py-10"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <h1
            id="hero-title"
            className="text-[2rem] leading-[0.96] font-semibold tracking-[-0.035em] uppercase sm:text-[2.75rem] lg:text-[3.25rem]"
          >
            No Touching Grass
            <br />
            <span className="text-muted">Invitational</span>
          </h1>

          <p className="mt-4 text-base text-muted">
            Climb now. Touch grass later.
          </p>

          <p className="eyebrow mt-4 text-moss">Solo Queue · NA · 2026</p>
        </div>

        <Countdown />
      </div>
    </section>
  );
}
