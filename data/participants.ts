import type { Role } from "@/lib/ranks";

/**
 * MANUAL EVENT DATA — maintained by the organiser, never inferred from Riot.
 *
 * Riot supplies rank, LP, W/L and match history. It does not supply roles or
 * Twitch channels, and it never will; those live here and are never
 * overwritten by anything the API returns.
 */
export type ParticipantConfig = {
  /** Stable event id. */
  id: string;

  // --- identity (Riot ID is player-facing; PUUID is resolved at fetch time) ---
  gameName: string;
  tagLine: string;

  // --- manual metadata ---
  /** `null` until the organiser assigns one. Never guessed. */
  role: Role | null;
  twitchUsername: string | null;
  twitchUrl: string | null;
  /** Temporary frontend state until a server-side Twitch integration exists. */
  isLive: boolean;
};

/**
 * The real participants. Every one resolves through the Riot API.
 *
 * Adding someone here is the whole job: standings, rank lookup, STREAK,
 * match-history sync and Top Champions all iterate this list.
 *
 * Riot IDs are stored exactly as Riot holds them, including non-ASCII
 * characters. Invisible bidirectional formatting marks that survive a paste
 * are stripped at request time (see lib/riot/account.ts), not here.
 */
export const participants: ParticipantConfig[] = [
  {
    id: "wini11",
    gameName: "wini11",
    tagLine: "NA1",
    role: "JUNGLE",
    twitchUsername: null,
    twitchUrl: null,
    isLive: false,
  },
  {
    id: "extantcord",
    gameName: "ExtantCord",
    tagLine: "45366",
    role: "TOP",
    twitchUsername: null,
    twitchUrl: null,
    isLive: false,
  },
  {
    id: "elpepingas",
    gameName: "Elpepingas",
    tagLine: "GOAT",
    role: "JUNGLE",
    twitchUsername: null,
    twitchUrl: null,
    isLive: false,
  },
  {
    id: "josuei",
    gameName: "JosueI",
    tagLine: "GOD",
    role: "JUNGLE",
    twitchUsername: "josukevt",
    twitchUrl: "https://www.twitch.tv/josukevt",
    isLive: false,
  },
  {
    id: "maomao",
    gameName: "maomao",
    tagLine: "neko1",
    role: "ADC",
    twitchUsername: "kiraawrr",
    twitchUrl: "https://www.twitch.tv/kiraawrr",
    isLive: false,
  },
  {
    id: "mojarraoyasumi",
    gameName: "MojarraOyasumi",
    tagLine: "afk",
    role: "MID",
    twitchUsername: "gotosleep_oyasumi",
    twitchUrl: "https://www.twitch.tv/gotosleep_oyasumi",
    isLive: false,
  },
  {
    id: "hellberg",
    gameName: "地獄Hellberg",
    tagLine: "00000",
    role: "ADC",
    twitchUsername: null,
    twitchUrl: null,
    isLive: false,
  },
  {
    id: "shiro",
    gameName: "Shiro",
    tagLine: "slayr",
    role: "JUNGLE",
    twitchUsername: "codeslayrr",
    twitchUrl: "https://www.twitch.tv/codeslayrr",
    isLive: false,
  },
  {
    id: "espiropapa",
    gameName: "Espiropapa",
    tagLine: "5891",
    role: "JUNGLE",
    twitchUsername: null,
    twitchUrl: null,
    isLive: false,
  },
];
