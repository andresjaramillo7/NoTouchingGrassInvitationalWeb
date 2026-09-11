import { PlayerRow, ROW_GRID } from "@/components/player-row";
import { SectionHeading } from "@/components/section-heading";
import { StandingsTitle } from "@/components/standings-title";
import { TopThreeCards } from "@/components/top-three";
import { isRanked } from "@/lib/ranks";
import { getStandings } from "@/lib/standings";

/**
 * Server Component: Riot data is fetched here and arrives at the client
 * already mapped. Nothing about the API reaches the browser.
 */
export async function Standings() {
  const { players: ranked } = await getStandings();

  return (
    <section
      id="standings"
      aria-labelledby="standings-title"
      className="border-b border-line bg-surface px-5 py-10 sm:px-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <SectionHeading
          id="standings-title"
          number="01"
          title={<StandingsTitle />}
          meta={`${ranked.length} Players`}
        />

        <div className="mt-6">
          <TopThreeCards
            players={ranked.filter(isRanked).slice(0, 3)}
          />
        </div>

        {/* The full leaderboard continues the same section — no second heading. */}
        <div
          aria-hidden
          className={`mt-10 hidden px-4 pb-3 md:grid ${ROW_GRID}`}
        >
          <span className="eyebrow text-muted/60">#</span>
          <span className="eyebrow text-muted/60">Player</span>
          <span className="eyebrow hidden text-center text-muted/60 xl:block">
            Role
          </span>
          <span className="eyebrow text-muted/60">Rank</span>
          <span className="eyebrow text-right text-muted/60">LP</span>
          <span className="eyebrow text-right text-muted/60">W / L</span>
          <span className="eyebrow text-right text-muted/60">WR</span>
          <span className="eyebrow hidden text-center text-muted/60 lg:block">
            Streak
          </span>
          <span className="eyebrow text-right text-muted/60">Stats</span>
        </div>

        <ol className="mt-6 divide-y divide-line border-y border-line md:mt-0">
          {ranked.map((player, index) => (
            <PlayerRow
              key={player.id}
              player={player}
              position={index + 1}
            />
          ))}
        </ol>

        <p className="mt-4 font-mono text-[0.6875rem] leading-relaxed text-muted/55">
          Ordered by tier, then division, then league points. Win rate breaks an
          exact tie.
        </p>
      </div>
    </section>
  );
}
