import { isStreamingLive, twitchChannel, type Player } from "@/lib/ranks";

/**
 * Official Twitch Glitch mark. Rendered only for players whose channel the
 * organiser has configured, so no-channel players can never appear live.
 *
 * `isLive` is organiser-set: we never call Twitch, so a channel renders in
 * its offline treatment unless that flag says otherwise.
 */
export function TwitchBadge({
  player,
  className = "h-4 w-auto",
}: {
  player: Player;
  className?: string;
}) {
  const channel = twitchChannel(player);
  if (!channel) return null;

  const live = isStreamingLive(player);

  return (
    <a
      href={channel.url}
      target="_blank"
      rel="noopener noreferrer"
      title={
        live
          ? `${channel.username} is live on Twitch`
          : `${channel.username} on Twitch`
      }
      className="inline-flex shrink-0 items-center transition-opacity hover:opacity-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/social/twitch.svg"
        alt=""
        width={16}
        height={19}
        className={`${className} ${
          live ? "opacity-100" : "opacity-45 grayscale"
        }`}
        style={
          live
            ? { filter: "drop-shadow(0 0 3px rgb(145 70 255 / 0.55))" }
            : undefined
        }
      />
      <span className="sr-only">
        {live
          ? `${channel.username} is live on Twitch`
          : `${channel.username} on Twitch, offline`}
      </span>
    </a>
  );
}
