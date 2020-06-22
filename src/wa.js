'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');

const bodyParser = require('body-parser');
const request = require('request-promise-native');

const sessions = require('./sessions');

const REQUEST_TIMEOUT = 5000; 

const requestLogger = (req, res, next) => {
    console.log(`
=================================================
Base URL: ${req.baseUrl}
Hostname: ${req.hostname}
Path: ${req.path}
Params: ${JSON.stringify(req.params, null, 4)}
=================================================
    `)
    next()
}


class WaChatApi extends EventEmitter {

    constructor(options, express_app){
        super();
        assert.ok(options);
        assert.ok(options.scenarioKey);
        assert.ok(options.apiBaseUrl);
        assert.ok(options.apiKey);
        assert.ok(express_app);
        assert.ok(express_app.use);
        this.scenarioKey = options.scenarioKey;
        this.apiBaseUrl = options.apiBaseUrl;
        this.apiKey = options.apiKey;
        express_app.use(bodyParser.json());
        // express_app.use(requestLogger);

        this.handleMessage = this.handleMessage.bind(this)
        this.onTextMessage = this.onTextMessage.bind(this)
        this.onImageMessage = this.onImageMessage.bind(this)
        this.onLocationMessage = this.onLocationMessage.bind(this)
        this.onDocumentMessage = this.onDocumentMessage.bind(this)
        this.onVoiceMessage = this.onVoiceMessage.bind(this)
        this.onContactMessage = this.onContactMessage.bind(this)

        express_app.use('/wa', this.handleMessage)
        // express_app.use('/', this.handleMessage)
        this.sessions = sessions()
    }


    start(){}


    sendText(chatId, text){
        console.log(`WaChatApi.sendText, chatId: ${chatId}, text: ${text}`);
        return this.sendMessage(chatId, { text: text });
    }

    sendPhoto(chatId, fileUrl, fileName){
        console.log(`WaChatApi.sendPhoto, chatId: ${chatId}, fileUrl: ${fileUrl}, fileName: ${fileName}`);
        return this.sendMessage(chatId, { text: fileName || '', imageUrl: fileUrl });
    }


    sendDoc(chatId, fileUrl, fileName){
        console.log(`WaChatApi.sendDoc, chatId: ${chatId}, fileUrl: ${fileUrl}, fileName: ${fileName}`);
        return this.sendMessage(chatId, { text: fileName || '', fileUrl: fileUrl });
    }


    sendTyping(chat_id, cb){}


    endChat(chat_id, text, cb){}


    handleMessage(req, res, next){
        if (!req.body || !req.body.results) {
            // console.log('Request body empty or has no results property');
            res.status(200).end();
            return;
        }
        const promises = req.body.results.map(result => {
            // console.log(`WaChatApi.handleMessage, result: ${JSON.stringify(result)}`);
            const from = result.from;
            const to = result.to;
            const msg = result.message;
            if(msg && msg.type){
                console.log(`--------------------------------------------`);
                console.log(`WaChatApi.handleMessage, from: ${from}, to: ${to}, msg: ${JSON.stringify(msg)}`);
                console.log(`--------------------------------------------`);
                switch(msg.type){
                    case 'TEXT':
                        return this.onTextMessage(result.messageId, result.from, msg.text, result.from);
                    case 'IMAGE':
                        return this.onImageMessage(result.messageId, result.from, msg.url, msg.caption, result.from);
                    case 'LOCATION':
                        return this.onLocationMessage(result.messageId, result.from, msg.url, result.from);
                    case 'DOCUMENT':
                        return this.onDocumentMessage(result.messageId, result.from, msg.url, result.from);
                    case 'VOICE':
                        return this.onVoiceMessage(result.messageId, result.from, msg.url, result.from);
                    case 'CONTACT':
                        return this.onContactMessage(result.messageId, result.from, msg.url, result.from);
                    default:
                        throw `WaChatApi.handleMessage: Unexpected message type: "${msg.type}"`;
                }
            }
        })
        Promise.all(promises).then(() => {
            res.status(200).end();
        }).catch(err => {
            // console.error('WaChatApi.handleMessage:', err);
            res.status(500).end();
        })
    }

    getAuthHeaders(){
        return {
            Authorization: `App ${this.apiKey}`
        }
    }

    sendMessage(chatId, msg){
        console.log(`WaChatApi.sendMessage, chatId: ${chatId}, msg: ${JSON.stringify(msg)}`);
        const sem = this.sessions.findOrCreate(chatId).sem;
        return sem.takeWithPromise().then(() => {
            const url = `${this.apiBaseUrl}/omni/1/advanced`;
            return request.post(url, {
                body: {
                    scenarioKey: this.scenarioKey,
                    destinations: [{to: {phoneNumber: chatId}}],
                    whatsApp: msg
                },
                headers: this.getAuthHeaders(),
                json: true,
                timeout: REQUEST_TIMEOUT,
            })
            .then(body => {
                console.log(`WaChatApi.sendMessage, response body: ${JSON.stringify(body)}`);
                return body;
            })
            // .then(body => JSON.parse(body))
            .then(body => {
                sem.leave();
                // if(body && body.error){
                //     throw body.error;
                // }
            })
            .catch(e => {
                sem.leave();
                console.error(`WaChatApi.sendMessage, error: ${e}`);
                throw e
            })
        })
    }


    onTextMessage(msgId, chatId, text, from){
        console.log(`WaChatApi.onTextMessage, msgId: ${msgId}, chatId: ${chatId}, text: ${text}, from: ${from}`);
        this.emit('text', {
            message_id: msgId,
            chat_id: chatId,
            text,
            from: {name: from},
        })
    }


    onImageMessage(msgId, chatId, url, caption, from){
        console.log(`WaChatApi.onImageMessage, msgId: ${msgId}, chatId: ${chatId}, url: ${url}, from: ${from}`);
        const req = request.get({url, headers: this.getAuthHeaders()});
        this.emit('image', {
            message_id: `${msgId}-1`,
            chat_id: chatId,
            url: req,
            from: {name: from},
        })
        this.emit('text', {
            message_id: `${msgId}-2`,
            chat_id: chatId,
            text: caption,
            from: {name: from},
        })
    }


    onLocationMessage(msgId, chatId, lon, lat, from){
        console.log(`WaChatApi.onLocationMessage, msgId: ${msgId}, chatId: ${chatId}, lon: ${lon}, lat: ${lat}, from: ${from}`);
        this.emit('location', {
            message_id: msgId,
            chat_id: chatId,
            location: {
                longitude: lon,
                latitude: lat
            },
            from: {name: from},
        })
    }


    onDocumentMessage(msgId, chatId, url, from){
        console.log(`WaChatApi.onDocumentMessage, msgId: ${msgId}, chatId: ${chatId}, url: ${url}, from: ${from}`);
        const req = request.get({url, headers: this.getAuthHeaders()});
        this.emit('file', {
            message_id: msgId,
            chat_id: chatId,
            url: req,
            file_name: '',
            from: {name: from},
        })
    }


    onVoiceMessage(msgId, chatId, url, from){
        console.log(`WaChatApi.onVoiceMessage, msgId: ${msgId}, chatId: ${chatId}, url: ${url}, from: ${from}`);
        const req = request.get({url, headers: this.getAuthHeaders()});
        this.emit('file', {
            message_id: msgId,
            chat_id: chatId,
            url: req,
            file_name: '',
            from: {name: from},
        })
    }


    onContactMessage(msgId, chatId, contacts, from){}

}


module.exports = {
    WaChatApi,
}
