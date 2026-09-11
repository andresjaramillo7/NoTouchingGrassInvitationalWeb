import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Prizes } from "@/components/prizes";
import { Rules } from "@/components/rules";
import { Standings } from "@/components/standings";

/**
 * ISR is the only cache in this project: the generated page is served until
 * it is 600 seconds old, then the next request regenerates it against the
 * live Riot API.
 *
 * Next requires a literal here, so it cannot import the shared constant.
 * Keep this in sync with REVALIDATE_SECONDS in lib/revalidate.ts.
 */
export const revalidate = 600;

export default function Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Standings />
        <Prizes />
        <Rules />
      </main>
      <Footer />
    </>
  );
}
