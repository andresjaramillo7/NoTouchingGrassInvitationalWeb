export function Footer() {
  return (
    <footer className="border-t border-line px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="eyebrow text-ink">No Touching Grass Invitational</p>
          <p className="eyebrow text-muted/70">Inaugural Edition · NA · 2026</p>
        </div>

        <p className="mt-7 max-w-[70ch] text-xs leading-relaxed text-muted/60">
          No Touching Grass Invitational is not endorsed by Riot Games and does
          not reflect the views or opinions of Riot Games or anyone officially
          involved in producing or managing Riot Games properties. Riot Games and
          all associated properties are trademarks or registered trademarks of
          Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
