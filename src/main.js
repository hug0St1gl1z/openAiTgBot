import { Telegraf, session, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { code } from 'telegraf/format'
import fetch from 'node-fetch'
import config from 'config'
import { ogg } from './ogg.js'
import { openAi } from './OpenAI.js'

const bot = new Telegraf(config.get('TOKEN'))
const INIT_SESSION = { messages: [] }
bot.use(session())
const hi1 = 'Если хочешь поболтать с кем то, кто умнее тебя - просто задай мне вопрос голосом или напиши его! \n'
const hi2 = 'Если хочешь узнать погоду в месте где ты находишься нажми на кнопку!'

bot.command('new', async (ctx) => {
	ctx.session = INIT_SESSION
	await ctx.reply('Готов к новому разговору...')
})

bot.command('start', async (ctx) => {
	try {
		ctx.session = INIT_SESSION
		await ctx.reply(
        `${hi1}`)
        await ctx.reply(
            `${hi2}`, Markup.keyboard([{text: 'Узнать погоду', request_location: true}]).resize())
	} catch (e) {
		console.log('Error strat: ', e.message)
	}
})


bot.start()

bot.on(message('voice'), async (ctx) => {
	ctx.session ??= INIT_SESSION
	try {
		await ctx.reply(code('Сообщение принято - перевожу!'))
		const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
		const userId = String(ctx.message.from.id)
		const oggPath = await ogg.create(link.href, userId)
		const mp3Path = await ogg.toMp3(oggPath, userId)

		const text = await openAi.transcription(mp3Path)

		await ctx.reply(code('Ваш запрос обработан: ', `${text}`))
		ctx.session.messages.push({ role: openAi.roles.USER, content: text })
		const response = await openAi.chat(ctx.session.messages)
		ctx.session.messages.push({
			role: openAi.roles.ASSISTANT,
			content: response.content,
		})
		await ctx.reply(response.content)
	} catch (e) {
		console.log('Error voice: ', e.message)
	}
})

bot.on(message('text'), async (ctx) => {
	ctx.session ??= INIT_SESSION
	try {
		ctx.session.messages.push({
			role: openAi.roles.USER,
			content: ctx.message.text,
		})
		const response = await openAi.chat(ctx.session.messages)
		ctx.session.messages.push({
			role: openAi.roles.ASSISTANT,
			content: response.content,
		})
		await ctx.reply(response.content)
	} catch (e) {
		console.log('Error text: ', e.message)
	}
})

bot.on(message('location'), async (ctx) => {
	const latitude = ctx.update.message.location.latitude
	const longitude = ctx.update.message.location.longitude
	const apiUrl = `${config.get(
		'weatherApiUrl'
	)}?lat=${latitude}&lon=${longitude}&appid=${config.get(
		'weatherApiKey'
	)}&units=metric`

	try {
		const response = await fetch(apiUrl)
		const data = await response.json()

		const cityName = data.name
		const weatherDescription = data.weather[0].description
		const temperature = data.main.temp
		const feelsLike = data.main.feels_like
		const windSpeed = data.wind.speed
		const windDeg = data.wind.deg
		const windDirection = getWindDirection(windDeg)
		const message = `Погода в ${cityName}: ${weatherDescription}. \n\nТемпература: ${temperature}°C \n(ощущается как ${feelsLike}°C). \n\nСкорость ветра: ${windSpeed} м/с. \nНаправление ветра: ${windDirection}.`
		await ctx.reply(message)
        await ctx.reply('Готов к разговору...')
	} catch (error) {
		console.error(error)
		ctx.reply('Упс, что-то пошло не так. Попробуйте еще раз позже.')
	}
})

function getWindDirection(deg) {
	const directions = [
		'С',
		'ССВ',
		'СВ',
		'ВСВ',
		'В',
		'ВЮВ',
		'ЮВ',
		'ЮЮВ',
		'Ю',
		'ЮЮЗ',
		'ЮЗ',
		'ЗЮЗ',
		'З',
		'ЗСЗ',
		'СЗ',
		'ССЗ',
	]
	const index = Math.round((deg % 360) / 22.5)
	return directions[index]
}

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
