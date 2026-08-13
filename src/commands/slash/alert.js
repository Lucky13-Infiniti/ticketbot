const { SlashCommand } = require('@eartharoid/dbf');
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
} = require('discord.js');
const ms = require('ms');
const ExtendedEmbedBuilder = require('../../lib/embed');
const { isStaff } = require('../../lib/users');

// how long the ticket creator has to respond before the ticket is closed automatically
const AUTO_CLOSE_AFTER = ms('4h');

module.exports = class AlertSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'alert';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [],
		});
	}

	/**
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction) {
		/** @type {import("client")} */
		const client = this.client;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const settings = await client.prisma.guild.findUnique({ where: { id: interaction.guild.id } });
		const getMessage = client.i18n.getLocale(settings.locale);
		const ticket = await client.prisma.ticket.findUnique({ where: { id: interaction.channel.id } });

		if (!ticket) {
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.errorColour)
						.setTitle(getMessage('misc.not_ticket.title'))
						.setDescription(getMessage('misc.not_ticket.description')),
				],
			});
		}

		if (!(await isStaff(interaction.guild, interaction.user.id))) {
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.errorColour)
						.setTitle(getMessage('commands.slash.alert.not_staff.title'))
						.setDescription(getMessage('commands.slash.alert.not_staff.description')),
				],
			});
		}

		// the ticket is already waiting for a response, don't stack timers
		if (client.tickets.$stale.has(ticket.id)) {
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.errorColour)
						.setTitle(getMessage('commands.slash.alert.already_alerted.title'))
						.setDescription(getMessage('commands.slash.alert.already_alerted.description')),
				],
			});
		}

		const closeAt = Date.now() + AUTO_CLOSE_AFTER;

		// `expect: 'user'` restricts both buttons to the ticket creator,
		// and `accepted` is handled by the existing `close` button (src/buttons/close.js):
		// true closes the ticket immediately, false cancels the timer.
		const closeButtonId = {
			action: 'close',
			expect: 'user',
		};

		const sent = await interaction.channel.send({
			components: [
				new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId(JSON.stringify({
								accepted: true,
								...closeButtonId,
							}))
							.setStyle(ButtonStyle.Danger)
							.setEmoji(getMessage('buttons.close.emoji'))
							.setLabel(getMessage('buttons.close.text')),
						new ButtonBuilder()
							.setCustomId(JSON.stringify({
								accepted: false,
								...closeButtonId,
							}))
							.setStyle(ButtonStyle.Secondary)
							.setEmoji(getMessage('buttons.do_not_close.emoji'))
							.setLabel(getMessage('buttons.do_not_close.text')),
					),
			],
			content: `<@${ticket.createdById}>`,
			embeds: [
				new ExtendedEmbedBuilder({
					iconURL: interaction.guild.iconURL(),
					text: settings.footer,
				})
					.setColor(settings.primaryColour)
					.setTitle(getMessage('ticket.alert.title'))
					.setDescription(getMessage('ticket.alert.description', { timestamp: Math.floor(closeAt / 1000) })),
			],
		});

		// hand the ticket over to the stale handler (src/lib/stale.js),
		// which closes it once `closeAt` has passed.
		// replying in the channel cancels this (src/listeners/client/messageCreate.js).
		client.tickets.$stale.set(ticket.id, {
			closeAt,
			closedBy: null,
			message: sent,
			messages: 0,
			reason: 'inactivity',
			staleSince: Date.now(),
		});

		client.log.info.tickets(`${interaction.user.tag} sent an inactivity alert in ticket ${ticket.id}`);

		return await interaction.editReply({
			embeds: [
				new ExtendedEmbedBuilder({
					iconURL: interaction.guild.iconURL(),
					text: settings.footer,
				})
					.setColor(settings.successColour)
					.setTitle(getMessage('commands.slash.alert.success.title'))
					.setDescription(getMessage('commands.slash.alert.success.description', { timestamp: Math.floor(closeAt / 1000) })),
			],
		});
	}
};
