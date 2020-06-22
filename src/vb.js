'use strict';


const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const ViberBot  = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;
const TextMessage = require('viber-bot').Message.Text;
const PictureMessage = require('viber-bot').Message.Picture;
const sessions = require('./sessions')


class ViberConnection extends EventEmitter {

    constructor(options, express_app){
        super(options)
        const self = this

        assert.ok(options.authToken, 'ViberConnection options: authToken not set')
        assert.ok(options.name, 'ViberConnection options: name not set')
        assert.ok(options.avatarUrl, 'ViberConnection options: avatarUrl not set')
        assert.ok(options.webUrl, 'ViberConnection options: webUrl not set')
        assert.ok(express_app, 'ViberConnection options: express_app not set')

        self.bot = new ViberBot({
            authToken: options.authToken,
            name: options.name,
            avatar: options.avatarUrl
        })

        self.bot.on(BotEvents.MESSAGE_RECEIVED, (msg, res) => {
            super.emit('message_received', res.userProfile, msg);
        })

        express_app.use('/vb', self.bot.middleware()).on('started', () => {
            console.log('viber: setting webhook, url: ' + options.webUrl)
            self.bot.setWebhook(options.webUrl).then(() => {
                console.log('viber: webhook set')
            }).catch((err) => {
                console.error('viber: set webhook error: ', err)
            })
        })
    }

    start(){}

    send(userProfile, msg){
        return this.bot.sendMessage(userProfile, msg)
    }
}


class ViberMockConnection extends EventEmitter {

    constructor(options){
        super(options)
    }

    start(){
        console.log('ViberMockConnection: start()')
    }

    triggerMessage(userProfile, msg){
        super.emit('message_received', userProfile, new TextMessage(msg))
    }

    send(userProfile, msg){
        super.emit('message_to_viber', userProfile, msg)
    }
}


class ViberChatApi extends EventEmitter {

    constructor(conn){
        super()
        assert.ok(conn)
        this.conn = conn
        this.conn.on('message_received', (userProfile, msg) => {
            if(msg instanceof TextMessage){
                super.emit('text', {
                    message_id: msg.token,
                    chat_id: userProfile.id,
                    text: msg.text,
                    from: {
                        name: userProfile.name
                    }
                })
            } else if (msg instanceof PictureMessage){
                super.emit('image', {
                    message_id: msg.token,
                    chat_id: userProfile.id,
                    url: msg.url,
                    from: {
                        name: userProfile.name
                    }
                })
            } else {
                console.error('Unknown message type')
            }
        })
        this.sessions = sessions()
    }

    start(){
        this.conn.start()
    }

    sendText(chat_id, text, cb){
        let sem = this.sessions.findOrCreate(chat_id).sem
        let conn = this.conn
        sem.take(function(){
            let userProfile = {id: chat_id}
            conn.send(userProfile, new TextMessage(text)).then(() => sem.leave())
        })
    }

    sendPhoto(chat_id, file_url, file_name){
        console.log('viber sendPhoto, file_url: ' + file_url)
        let sem = this.sessions.findOrCreate(chat_id).sem
        let conn = this.conn
        sem.take(function(){
            let userProfile = {id: chat_id}
            conn.send(userProfile, new PictureMessage(file_url)).then(() => sem.leave())
        })
    }

    sendDoc(chat_id, file_url, file_name){}

    sendTyping(chat_id, cb){}

    endChat(chat_id, text, cb){}

}

module.exports = {
    ViberConnection: ViberConnection,
    ViberMockConnection: ViberMockConnection,
    ViberChatApi: ViberChatApi
}
