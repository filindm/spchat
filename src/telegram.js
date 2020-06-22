'use strict';

const EventEmitter = require('events');
const util = require('util');
const request = require('request');
const assert = require('assert');
const tempfile = require('tempfile');
const fs = require('fs');


var telegram = {};

telegram.ChatApi = function(cfg){

    assert(cfg, 'No configuration object');
    assert(cfg.token, 'Missing required configuration item: token');

    var self = this;
    EventEmitter.call(self);

    var token = cfg.token;
    var baseUrl = 'https://api.telegram.org/bot' + token;

    // Public methods
    self.start = function(){
        console.log('telegram: start');
        poll();
    }

    self.sendText = function(chat_id, text, cb){
        send(chat_id, 'sendMessage', {
            chat_id: chat_id,
            text: text
        });
    }

    self.sendPhoto = function(chat_id, file_url, file_name){
        var action = 'sendPhoto';
        var url = baseUrl + '/' + action;
        console.log('telegram: sendPhoto, chat_id: ' + chat_id + ', file_url: ' + file_url + ', url: ' + url);
        var sem = findOrCreateSession(chat_id).sem;
        sem.take(function(){
            request.post(url, {
                formData: {
                    chat_id: chat_id,
                    photo: file_url
                }
            })
            .on('response', (res) => {
                // console.log('telegram: status code: ' + res.statusCode)
                // console.log('telegram: status message: ' + res.statusMessage)
                if(res.statusCode >= 400){
                    console.log('telegram: error while sending photo, chat_id: ' + chat_id +
                        ', status code: ' + res.statusCode +
                        ', status message: ' + res.statusMessage)
                }
            })
            .on('error', (err) => {
                console.log('telegram: error while sending photo to ' + url + ': ' + err)
            })
            .on('end', () => {
                sem.leave();
                // console.log('telegram: semaphore released')
            })
            .pipe(process.stdout)
        })
    }

    self.sendDoc = function(chat_id, file_url, file_name){
        console.log(`telegram: sendDoc, chat_id: ${chat_id}, file_url: ${file_url}, file_name: ${file_name} - NOT IMPLEMENTED YET`)
    }

    self.sendTyping = function(chat_id, cb){
        send(chat_id, 'sendChatAction', {
            chat_id: chat_id,
            action: 'typing'
        });
    }

    self.endChat = function(chat_id, text, cb){
        if(text){
            send(chat_id, 'sendMessage', {
                chat_id: chat_id,
                text: text
            }, function(){
                removeSession(chat_id);
            });
        } else {
            removeSession(chat_id);
        }
    }

    // Private methods
    function getMe(){
        var url = baseUrl + '/getMe';
        request.get({
            url: url,
            json: true,
            timeout: 3500
        }, function(err, resp, data){
            if(err){
                console.error('telegram: getMe, error: ' + err);
            } else {
                if(!data.ok){
                    console.error('telegram: getMe, error: ' + data.description);
                } else {
                    console.log('telegram: getMe, result: ' + JSON.stringify(data.result));
                }
            }
        });
    }

    var poll_offset = 0;

    function poll(){
        var url = baseUrl + '/getUpdates';
        // console.log('poll, url: ' + url + ', offset: ' + poll_offset);
        request.get({
            url: url,
            json: true,
            body: {
                timeout: 3,
                offset: poll_offset
            },
            timeout: 3500

        }, onPollResponse);
    }

    function onPollResponse(err, resp, data){
        if(err){
            // console.error('poll, error: ' + err);
        } else {
            if(!data.ok){
                console.error('telegram: poll, error: ' + data.description);
            } else {
                data.result.forEach(function(v){
                    // console.log('poll, update: ' + JSON.stringify(v));
                    processEvent(v);
                    poll_offset = v.update_id + 1;
                });
            }
        }
        process.nextTick(function(){ // ???
            poll();
        });
    }

    function processEvent(ev){
        console.log('telegram: processEvent: ', ev);
        if(ev.message){
            var user_first_name = ev.message.from && ev.message.from.first_name || '';
            var user_last_name = ev.message.from && ev.message.from.last_name || '';
            var username = user_first_name +  ' ' + user_last_name;
            if(ev.message.text){
                self.emit('text', {
                    message_id: ev.message.message_id,
                    chat_id: ev.message.chat.id,
                    text: ev.message.text,
                    from: {
                        name: username
                    }
                })

            } else if(ev.message.photo || ev.message.sticker){
                var file_id = ev.message.photo ?
                    ev.message.photo[ev.message.photo.length - 1].file_id :
                    ev.message.sticker.file_id;
                var url = baseUrl + '/getFile';
                request.get({
                    url: url,
                    json: true,
                    body: {
                        file_id: file_id
                    },
                    timeout: 3500

                }, function(err, resp, data){
                    if(err){
                        console.error('telegram:', err);
                    } else if (!data.ok){
                        console.error('telegram: getFile error:', data.description);
                    } else {
                        if(data.result.file_path){
                            let url = 'https://api.telegram.org/file/bot' + token + '/' + data.result.file_path;
                            self.emit('image', {
                                message_id: ev.message.message_id,
                                chat_id: ev.message.chat.id,
                                url: url,
                                from: {
                                    name: username
                                }
                            })
                        } else {
                            console.error('telegram: getFile: no file path');
                        }
                    }
                })

            } else if(ev.message.location){
                self.emit('location', {
                    message_id: ev.message.message_id,
                    chat_id: ev.message.chat.id,
                    location: ev.message.location,
                    from: {
                        name: username
                    }
                })
            } else if(ev.message.contact){
                self.emit('text', {
                    message_id: ev.message.message_id,
                    chat_id: ev.message.chat.id,
                    text: ev.message.contact.first_name + ': '
                        + ev.message.contact.phone_number,
                    from: {
                        name: username
                    }
                })
            } else {

            }
        }
    }


    // TODO: extract sessions to a separate module

    var sessions = {};

    function findOrCreateSession(chat_id){
        if(!sessions.hasOwnProperty(chat_id)){
            sessions[chat_id] = {
                sem: require('semaphore')(1)
            }
        }
        return sessions[chat_id];
    }

    function removeSession(chat_id){
        delete sessions[chat_id];
    }


    function send(chat_id, action, data, cb){
        var url = baseUrl + '/' + action;
        var sem = findOrCreateSession(chat_id).sem;
        sem.take(function(){
            request.get({
                url: url,
                json: true,
                body: data,
                timeout: 3500
            }, function(err, resp, data){
                sem.leave();
                if(err){
                    console.error('telegram: ', action + ', error: ' + err);
                    cb && cb(err);
                } else {
                    if(!data.ok){
                        console.error('telegram: ', action + ', error: ' + data.description);
                        cb && cb(data.description);
                    } else {
                        cb && cb();
                    }
                }
            });
        })
    }
}

util.inherits(telegram.ChatApi, EventEmitter);


////////////////////////////////////////////////////////////////////////////////
module.exports = telegram;
