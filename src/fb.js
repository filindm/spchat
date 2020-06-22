'use strict';


const assert = require('assert');
const EventEmitter = require('events');

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const sessions = require('./sessions');
const utils = require('./utils');


class FbChatApi extends EventEmitter {

    constructor(options, express_app){
        super();

        assert.ok(options);
        assert.ok(options.verifyToken);
        assert.ok(options.pageAccessToken);
        this.verifyToken = options.verifyToken;
        this.pageAccessToken = options.pageAccessToken;

        assert.ok(express_app);
        assert.ok(express_app.use);
        express_app.use(bodyParser.urlencoded({ extended: false }));
        express_app.use(bodyParser.json());

        this.webhook = this.webhook.bind(this)
        express_app.use('/fb/webhook', this.webhook)
        this.sessions = sessions()

        this.start = this.start.bind(this)
        this.sendText = this.sendText.bind(this)
        this.sendPhoto = this.sendPhoto.bind(this)
        this.sendDoc = this.sendDoc.bind(this)
        this.sendTyping = this.sendTyping.bind(this)
        this.endChat = this.endChat.bind(this)
        this.handleMessage = this.handleMessage.bind(this)
        this.sendMessage = this.sendMessage.bind(this)
        this.getUserProfile = this.getUserProfile.bind(this)
        this.onTextMessage = this.onTextMessage.bind(this)
        this.onImageMessage = this.onImageMessage.bind(this)
        this.onVideoMessage = this.onVideoMessage.bind(this)
        this.onDocMessage = this.onDocMessage.bind(this)
    }

    webhook(req, res){
        console.log('FbChatApi.webhook')
        if(req.method === 'GET'){
            let mode = req.query['hub.mode'];
            let token = req.query['hub.verify_token'];
            let challenge = req.query['hub.challenge'];
            // Checks if a token and mode is in the query string of the request
            if (mode && token) {
                // Checks the mode and token sent is correct
                if (mode === 'subscribe' && token === this.verifyToken) {
                    // Responds with the challenge token from the request
                    console.log('WEBHOOK_VERIFIED');
                    res.status(200).send(challenge);
                } else {
                    // Responds with '403 Forbidden' if verify tokens do not match
                    res.sendStatus(403);
                }
            }
        } else if (req.method === 'POST') {
            let body = req.body;
            console.log(`POST /webhook BODY: ${JSON.stringify(body)}`);
            // Checks this is an event from a page subscription
            if (body.object === 'page') {
                body.entry.forEach(entry => {
                    let webhook_event = entry.messaging[0];
                    console.log(webhook_event);
                    let sender_psid = webhook_event.sender.id;
                    console.log('Sender PSID: ' + sender_psid);
                    if (webhook_event.message) {
                        this.handleMessage(sender_psid, webhook_event.message);
                    } else {
                        console.warn(`Unknown event type: ${webhook_event}`);
                    }
                });
                res.status(200).send('EVENT_RECEIVED');
            } else {
                // Returns a '404 Not Found' if event is not from a page subscription
                res.sendStatus(404);
            }
        }
    }


    ////////////////////////////////////////////////////////////////////////////
    // API
    ////////////////////////////////////////////////////////////////////////////
    start(){}

    sendText(chat_id, text){
        console.log(`FbChatApi.sendText, chat_id: ${chat_id}, text: ${text}`)
        this.sendMessage(chat_id, {
            text: text
        });
    }

    sendPhoto(chat_id, file_url, file_name){
        console.log(`FbChatApi.sendPhoto, chat_id: ${chat_id}, file_url: ${file_url}, file_name: ${file_name}`)
        this.sendMessage(chat_id, {
            attachment: {
                type: 'image',
                payload: {
                    url: file_url,
                    is_reusable: false
                }
            }
        })
    }

    sendDoc(chat_id, file_url, file_name){
        console.log(`FbChatApi.sendDoc, chat_id: ${chat_id}, file_url: ${file_url}, file_name: ${file_name}`)
        this.sendMessage(chat_id, {
            attachment: {
                type: 'file',
                payload: {
                    url: file_url,
                    is_reusable: false
                }
            }
        })
    }

    sendTyping(chat_id, cb){}

    endChat(chat_id, text, cb){}


    ////////////////////////////////////////////////////////////////////////////

    handleMessage(sender_psid, message){
        console.log(`FbChatApi.handleMessage, sender_psid: ${sender_psid}, message: ${JSON.stringify(message)}`)
        if(message.text){
            this.onTextMessage(message.mid, sender_psid, message.text)
        }
        if(message.attachments){
            message.attachments.forEach(attachment => {
                if(attachment.type === 'file'){
                    this.onDocMessage(message.mid, attachment.payload.url, sender_psid)
                } else if (attachment.type === 'image') {
                    this.onImageMessage(message.mid, attachment.payload.url, sender_psid)
                } else if (attachment.type === 'video') {
                    this.onVideoMessage(message.mid, attachment.payload.url, sender_psid)
                }
            })
        }
    }

    sendMessage(sender_psid, message) {
        console.log(`FbChatApi.sendMessage, sender_psid: ${sender_psid}, message: ${JSON.stringify(message)}`)
        // Construct the message body
        let request_body = {
            recipient: {
                id: sender_psid
            },
            message,
        }
        // Send the HTTP request to the Messenger Platform
        request({
            uri: "https://graph.facebook.com/v2.6/me/messages",
            qs: { access_token: this.pageAccessToken },
            method: "POST",
            json: request_body
        }, (err, res, body) => {
            if (err) {
                console.error(`FbChatApi.sendMessage: failed to send message, err: ${err}`);
            }
        });
    }

    getUserProfile(psid){
        console.log(`FbChatApi.getUserProfile, psid: ${psid}`)
        return new Promise((resolve, reject) => {
            request({
                uri: `https://graph.facebook.com/${psid}`,
                qs: {
                    fields: 'first_name,last_name,profile_pic',
                    access_token: this.pageAccessToken
                },
                method: 'GET'
            }, (err, res, body) => {
                body = JSON.parse(body)
                console.log(`FbChatApi.getUserProfile: ${JSON.stringify(body)}`)
                if(err){
                    resolve({
                        name: psid,
                    })
                }
                resolve({
                    name: `${body.first_name} ${body.last_name}`,
                    url: body.profile_pic
                })
            })
        })
        // curl -X GET "https://graph.facebook.com/<PSID>?fields=first_name,last_name,profile_pic&access_token=<PAGE_ACCESS_TOKEN>"
    }

    onTextMessage(id, fromId, text){
        console.log(`FbChatApi.onTextMessage, id: ${id}, fromId: ${fromId}, test: ${text}`)
        this.getUserProfile(fromId).then(from => {
            this.emit('text', {
                message_id: id,
                chat_id: fromId,
                text: text,
                from
            })
        })
    }

    onImageMessage(id, photoUrl, fromId){
        console.log(`FbChatApi.onImageMessage, id: ${id}, photoUrl: ${photoUrl}, fromId: ${fromId}`)
        this.getUserProfile(fromId).then(from => {
            this.emit('image', {
                message_id: id,
                chat_id: fromId,
                url: photoUrl,
                from
            })
        })
    }

    onVideoMessage(id, fileUrl, fromId){
        console.log(`FbChatApi.onVideoMessage, id: ${id}, fileUrl: ${fileUrl}, fromId: ${fromId}`)
        this.getUserProfile(fromId).then(from => {
            this.emit('text', {
                message_id: id,
                chat_id: fromId,
                text: fileUrl,
                from,
            })
        })
    }

    onDocMessage(id, fileUrl, fromId){
        console.log(`FbChatApi.onDocMessage, id: ${id}, fileUrl: ${fileUrl}, fromId: ${fromId}`)
        this.getUserProfile(fromId).then(from => {
            this.emit('file', {
                message_id: id,
                chat_id: fromId,
                url: fileUrl,
                file_name: decodeURI(utils.fileNameFromURL(fileUrl)),
                from,
            })
        })
    }

};

module.exports = {
    FbChatApi
}
