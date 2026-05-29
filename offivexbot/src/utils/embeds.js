// Embed helpers — every embed in the bot should be built through one of
// these so the Offivex look-and-feel stays consistent across commands /
// events / DMs without each callsite re-discovering the brand color and
// footer convention.
//
// Pattern usage cheat-sheet:
//   brandedEmbed()       → generic embed (purple bar + Offivex footer)
//   authorBarEmbed()     → like the Wynlers welcome card: small author bar
//                          at the top with optional icon + label, no title
//   noticeEmbed(variant) → color-coded for confirmations / warnings /
//                          danger / info. Use `success` after a destructive
//                          action confirms, `danger` for errors users see.
//   withBanner({...}, embed, components?) → returns a `channel.send`-ready
//                          payload with a generated PNG banner attached
//                          ABOVE the embed (the Wynlers "TICKET DISCORD"
//                          pattern).

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { COLOR, BRAND_NAME, brandFooter } = require('./brand');
const { generateBanner } = require('./bannerGenerator');

/**
 * Build a base embed with the Offivex brand defaults applied (purple bar
 * + footer with the running year). The `guild` arg lets us put the
 * server icon next to the footer text for extra polish.
 *
 * @param {Object}  [opts]
 * @param {number}  [opts.color]   Override the left-bar color (use COLOR.embed* constants).
 * @param {string|null} [opts.footer] Footer text. `null` disables the footer entirely.
 * @param {Object}  [opts.guild]   Discord.js Guild — used for the footer icon.
 * @returns {EmbedBuilder}
 */
function brandedEmbed({ color = COLOR.embedDefault, footer, guild = null } = {}) {
  const embed = new EmbedBuilder().setColor(color);
  const footerText = footer === undefined ? brandFooter() : footer;
  if (footerText !== null) {
    embed.setFooter({
      text: footerText,
      iconURL: guild?.iconURL?.({ dynamic: true }) ?? undefined,
    });
  }
  return embed;
}

/**
 * Same as `brandedEmbed` but pre-fills an "author bar" header. Use for
 * notification-style embeds where you want a small label + icon at the
 * very top of the card (e.g. "👤 NEW MEMBER (#387)", "🎉 GIVEAWAY",
 * "💎 BOOSTER").
 *
 * @param {Object}  opts
 * @param {string|{name:string, iconURL?:string}} opts.author
 *                          Either a plain string (rendered as the author
 *                          name) or the discord.js author object.
 * @param {number}  [opts.color]  Override the left-bar color.
 * @param {string|null} [opts.footer]
 * @param {Object}  [opts.guild]
 * @returns {EmbedBuilder}
 */
function authorBarEmbed({ author, color = COLOR.embedDefault, footer, guild = null }) {
  const embed = brandedEmbed({ color, footer, guild });
  embed.setAuthor(typeof author === 'string' ? { name: author } : author);
  return embed;
}

/**
 * Color-coded notice embed. Variants : success | warning | danger | info.
 * Use after destructive actions confirm, when an error must be shown to a
 * user, etc. Doesn't pre-fill an author bar — combine with .setAuthor()
 * if you want one.
 */
function noticeEmbed(variant, { footer, guild = null } = {}) {
  const colorMap = {
    success: COLOR.embedSuccess,
    warning: COLOR.embedWarning,
    danger: COLOR.embedDanger,
    info: COLOR.embedInfo,
  };
  return brandedEmbed({
    color: colorMap[variant] ?? COLOR.embedDefault,
    footer,
    guild,
  });
}

/**
 * Build a `channel.send`-ready payload that includes a generated banner
 * attached ABOVE the embed. Discord renders attachments before embeds in
 * the same message, so the result looks like a single card with the
 * banner as its visual header.
 *
 * @param {Object}  bannerOpts          Forwarded to generateBanner().
 * @param {string}  bannerOpts.title    Required big headline.
 * @param {string} [bannerOpts.subtitle]
 * @param {"purple"|"green"|"gradient"} [bannerOpts.variant]
 * @param {EmbedBuilder} embed          The embed that sits below the banner.
 * @param {Array}        [components]   Optional ActionRow[] to append.
 * @returns {Promise<Object>}           Send-ready payload `{files, embeds, components}`.
 */
async function withBanner(bannerOpts, embed, components = []) {
  const buffer = await generateBanner(bannerOpts);
  const attachment = new AttachmentBuilder(buffer, { name: 'banner.png' });
  return {
    files: [attachment],
    embeds: [embed],
    components,
  };
}

module.exports = {
  brandedEmbed,
  authorBarEmbed,
  noticeEmbed,
  withBanner,
  // Re-export COLOR/BRAND so callsites need only one import.
  COLOR,
  BRAND_NAME,
};
