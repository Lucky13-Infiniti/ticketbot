module.exports.get = fastify => ({
	handler: async (req, res) => {
		/** @type {import('client')} */
		const client = req.routeOptions.config.client;
		const id = req.params.guild;
		const guild = client.guilds.cache.get(id) ?? {};
		const { query } = req.query;
		switch (query) {
		case 'channels.cache':
			return guild.channels.cache;
		case 'roles.cache':
			return guild.roles.cache;
		default:
			return res.code(400).send({
				error: 'Bad Request',
				message: 'Invalid query parameter.',
				statusCode: 400,
			});;
		}
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
