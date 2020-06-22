'use strict';

//////////////////////////////////////////////////////////////////////////////////
// const express = require('express');
// const PORT = process.env.PORT || 3000;

// const express_app = express();
// express_app.use(express.json());

// express_app.post('/', (req, res) => {
//     console.log('=== Incoming request ===');
//     console.log('client ip:', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
//     console.log('headers:', req.headers);
//     console.log('url:', req.url);
//     console.log('method:', req.method);
//     console.log('params:', req.params);
//     console.log('query:', req.query);
//     console.log('body:', req.body);
//     console.log('========================');
//     res.status(200).send('OK');
// })

// express_app.listen(PORT, '0.0.0.0', () => {
//     console.log('express app started');
//     express_app.emit('started');
// })

//////////////////////////////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;
const SPCHAT_CONFIG_PATH = process.env.SPCHAT_CONFIG_PATH || '../config.json'
const config = require(SPCHAT_CONFIG_PATH);

// Localhost
const WEB_URL = typeof(process.env.WEB_URL) !== 'undefined' ? process.env.WEB_URL : 'localhost:3000';

console.log('--------------------------------------')
console.log('config: ', SPCHAT_CONFIG_PATH)
console.log('--------------------------------------')

const spchat = require('./spchat');
const telegram = require('./telegram');
const vk = require('./vk');
const vb = require('./vb');
const wc = require('./wc');
const fb = require('./fb');
const wa = require('./wa');
const util = require('util');
const express = require('express');
const mime = require('mime');
const fs = require('fs');
const request = require('request');
const assert = require('assert');

assert.ok(PORT, "PORT not set");
assert.ok(WEB_URL, "WEB_URL not set");

// const globalHttpLog = require('global-request-logger')
// globalHttpLog.initialize({maxBodyLength: 100})
// globalHttpLog.on('success', (req, res) => {
//     console.log('=============================================================')
//     console.log('SUCCESS')
//     console.log('Request: ', req)
//     console.log('Response: ', res)
//     console.log('=============================================================')
// })
// globalHttpLog.on('error', (req, res) => {
//     console.log('=============================================================')
//     console.log('ERROR')
//     console.log('Request', req)
//     console.log('Response', res)
//     console.log('=============================================================')
// })


const express_app = express();
express_app.get('/file/:data/:name', (req, res) => {
    if(req.params.data){
        let data = new Buffer(req.params.data, 'base64').toString('utf8');
        console.log('srv.js: data: ' + data)
        try {
            data = JSON.parse(data);
            const spChat = spChatApiFactory.findChatApi(data.userId);
            if(spChat){
                // res.writeHead(200, {
                //     'Content-Type': data.mime,
                // });
                // spChat.getFile(data.userId, data.chatId, data.fileId).pipe(res);
                spChat.getFile(data.userId, data.chatId, data.fileId).then(body => {
                    res.writeHead(200, {
                        'Content-Type': data.mime,
                        'Content-Length': body.length,
                    });
                    res.write(body);
                })
            } else {
                console.error('srv.js: cannot find chat api, userId: ' + data.userId)
            }
        } catch(e){
            console.error('srv.js: express error: ' + e);
        }
    } else {
        res.status(404).send('Not found');
    }
})

const spChatApiFactory = spchat.createChatApiFactory(Object.assign(config.spchat, {
    webUrl: WEB_URL
}));

const chatApis = {}

if(config.telegram){
    chatApis['telegram'] = new telegram.ChatApi(config.telegram);
}
if(config.vb){
    chatApis['vb'] = new vb.ViberChatApi(new vb.ViberConnection(Object.assign(config.vb, {
        webUrl: WEB_URL
    }), express_app));
}
if(config.wc){
    chatApis['wc'] = new wc.WeChatApi(config.wc, express_app)
}
if(config.vk){
    chatApis['vk'] = new vk.VkChatApi(config.vk, express_app)
}
if(config.fb){
    chatApis['fb'] = new fb.FbChatApi(config.fb, express_app)
}
if(config.wa){
    chatApis['wa'] = new wa.WaChatApi(config.wa, express_app)
}

configureSpChat();
Object.keys(chatApis).forEach((k) => {
    connectChatApi(chatApis[k], k)
})

express_app.listen(PORT, '0.0.0.0', function(){
    console.log('express app started');
    express_app.emit('started');
})


function configureSpChat(/*db*/){
    spChatApiFactory.forEach(function(spChat){

        spChat

        // event: 'chat_session_message'
        // party_id: '<party id>'
        // msg_id: '<message id>'
        // msg: '<chat message>'
        // timestamp: '<event time in Unix format>'
        .on('chat_session_message', function(event){
            console.log('srv: chat_session_message, msg_id: %s, timestamp: %d',
                event.msg_id, event.timestamp);
            var chatApi = findChatApi(event.userId);
            if(chatApi){
                // if(config.messages['CHAT_MESSAGE']){
                //     db.collection('chats').findOne({_id: event.chatId})
                //     .then(function(doc){
                //         var display_name = doc.parties[event.party_id].display_name || '';
                //         var msg = renderTemplate(config.messages['CHAT_MESSAGE'], {
                //             name: display_name,
                //             message: event.msg
                //         });
                //         if(msg){
                //             chatApi.sendText(removePrefix(event.userId), msg);
                //         }
                //     })
                // } else {
                    chatApi.sendText(removePrefix(event.userId), event.msg.replace('<br>', ''));
                // }
            }
        })

        // event: chat_session_typing
        // party_id: <party id>
        .on('chat_session_typing', function(event){
            var chatApi = findChatApi(event.userId);
            if(chatApi){
                chatApi.sendTyping(removePrefix(event.userId));
            }
        })

        // event: 'chat_session_party_joined'
        // party_id: '<party id>'
        // first_name: <party first name>
        // last_name: <party last name>
        // display_name: <party display name>
        // type: <scenario|external|internal>
        // timestamp: <event time in Unix format>
        .on('chat_session_party_joined', function(event){
            console.log('srv: chat_session_party_joined');
            if(event.type !== 'scenario'){
                var change = {};
                change['parties.' + event.party_id] = {
                    first_name: event.first_name,
                    last_name: event.last_name,
                    display_name: event.display_name
                }
                // db.collection('chats').updateOne(
                //     {_id: event.chatId},
                //     {$set: change}
                // )
                var msg = renderTemplate(config.messages['PARTY_JOINED'], {
                    name: event.display_name
                });
                console.log('srv: msg:', msg);
                if(msg){
                    var chatApi = findChatApi(event.userId);
                    if(chatApi){
                        chatApi.sendText(removePrefix(event.userId), msg);
                    }
                }
            }
        })

        // event: chat_session_party_left
        // party_id: <party id>
        // type: <scenario|external|internal> NOTE: absent in documentation
        // timestamp: <event time in Unix format>
        .on('chat_session_party_left', function(event){
            // if(event.type !== 'scenario'){
            //     // var party_display_name = "<party display name>";
            //     // var party_display_name = sharedData.getMap('chat.' + data.chatId)
            //     //     .remove('party.' + data.party_id);
            //     // var party_display_name = sharedData.getMap('chat.' + data.chatId)
            //     //     .remove('party.' + data.party_id);
            //     var change = {};
            //     change['parties.' + event.party_id] = "";
            //     db.collection('chats').findOneAndUpdate(
            //         {_id: event.chatId},
            //         {$unset: change}
            //     ).then(function(r){
            //         var party_display_name = r.value.parties[party_id].display_name;
            //         var msg = renderTemplate(config.messages['PARTY_LEFT'], {
            //             name: party_display_name
            //         });
            //         if(msg){
            //             var chatApi = findChatApi(event.userId);
            //             if(chatApi){
            //                 chatApi.sendText(removePrefix(event.userId), msg);
            //             }
            //         }
            //     })
            // }
        })

        // event: chat_session_form_show
        // form_request_id: <request ID that will be used by the client application to associate the response>
        // form_name: <predefined form name known to the client application>
        // form_timeout: <form timeout>
        .on('chat_session_form_show', function(event){
            // if(event.form_name.trim() === 'RequestLocation'){
            //     // console.log('findOneAndUpdate: id: ', spEvent.chatId);
            //     db.collection('chats').updateOne(
            //         {_id: event.chatId},
            //         {$set: {location_request_id: event.form_request_id}},
            //         {upsert: true})
            //     .then(function(r){
            //         var msg = config.messages['SEND_LOCATION'];
            //         if(msg){
            //             var chatApi = findChatApi(event.userId);
            //             if(chatApi){
            //                 chatApi.sendText(removePrefix(event.userId), msg);
            //             }
            //         }
            //     })
            // } else {
            //     // request other forms
            // }
        })

        // event: 'chat_session_status'
        // state: 'queued|connecting|connected|failed|completed'
        // ewt: '<estimated waiting time for queued status>'
        .on('chat_session_status', function(event){
            var msg = renderTemplate(config.messages['CHAT_STATUS'], {
                status: event.state,
                ewt: event.ewt
            });
            if(msg){
                var chatApi = findChatApi(event.userId);
                if(chatApi){
                    chatApi.sendText(removePrefix(event.userId), msg);
                }
            }
        })

        // event: chat_session_file
        // party_id: <party id>
        // msg_id: <message id>
        // file_id: <file id>
        // file_type: <image|attachment>
        // file_name: <file name with extension> NOTE: missing from documentation
        // timestamp: <event time in Unix format>
        .on('chat_session_file', function(event){
            var chatApi = findChatApi(event.userId);
            if(chatApi){
                if(event.file_type === 'image'){
                    chatApi.sendPhoto(removePrefix(event.userId), event.file_url, event.file_name)
                } else {
                    chatApi.sendDoc(removePrefix(event.userId), event.file_url, event.file_name)
                }
            }
        })

        .on('chat_session_ended', function(spEvent){
            var chatApi = findChatApi(spEvent.userId);
            if(chatApi){
                chatApi.endChat(removePrefix(spEvent.userId), config.messages['CHAT_ENDED']);
            }
            // db.collection('chats').remove({_id: spEvent.chatId});
        })

        .on('chat_session_timeout_warning', function(spEvent){
            var chatApi = findChatApi(spEvent.userId);
            if(chatApi){
                chatApi.sendText(removePrefix(spEvent.userId), spEvent.msg);
            }
        })
    })
}


function connectChatApi(chatApi, prefix/*, db*/){

    chatApi

    .on('text', event => {
        console.log(prefix + ' event: ', event);
        const spChat = spChatApiFactory.findChatApi(event.from.name);
        spChat.requestChat(prefix + ':' + event.chat_id, {
            last_name: event.from.name,
            profile_url: event.from.url
        }, data => {
            // console.log('=== sending text: ', event.text);
            spChat.sendText(
                prefix + ':' + event.chat_id,
                data.chat_id,
                event.text,
                event.message_id,
                () => {}, err => {
                    console.error('message send error: ' + err);
                });
        }, err => {
            console.error('error requesting chat: ' + err);
        });
    })

    .on('image', event => {
        console.log(prefix + ' image event: ', event);
        const spChat = spChatApiFactory.findChatApi(event.from.name);
        spChat.requestChat(prefix + ':' + event.chat_id, {
            last_name: event.from.name,
            profile_url: event.from.url
        }, data => {
            // console.log('=== sending image ===');
            spChat.sendFile(
                prefix + ':' + event.chat_id,
                data.chat_id,
                event.url,
                event.message_id,
                'image',
                () => {}, err => {
                    console.error('message send error: ' + err);
                });
        }, err => {
            console.error('error requesting chat: ' + err);
        });
    })

    // event type: file
    // message_id: id of the chat message
    // chat_id: id of the chat
    // url: URL of the file
    // file_name: name of the file
    // from.name: name of the sender
    // from.url: URL of the sender's profile picture
    .on('file', event => {
        console.log(prefix + ' file event: ', event);
        const spChat = spChatApiFactory.findChatApi(event.from.name);
        spChat.requestChat(prefix + ':' + event.chat_id, {
            last_name: event.from.name,
            profile_url: event.from.url
        }, data => {
            spChat.sendFile(
                prefix + ':' + event.chat_id,
                data.chat_id,
                event.url,
                event.message_id,
                'attachment',
                event.file_name,
                () => {}, err => {
                    console.error('message send error: ' + err);
                });
        }, err => {
            console.error('error requesting chat: ' + err);
        });
    })

    .on('video', event => {
        console.log(prefix + ' video event', event);
        const spChat = spChatApiFactory.findChatApi(event.from.name);
        spChat.requestChat(prefix + ':' + event.chat_id, {
            last_name: event.from.name,
            profile_url: event.from.url
        }, data => {
            // console.log('=== sending video ===');
            spChat.sendFile(
                prefix + ':' + event.chat_id,
                data.chat_id,
                event.player,
                event.message_id,
                'attachment',
                event.file_name,
                () => {}, err => {
                    console.error('message send error: ' + err);
                });
        }, err => {
            console.error('error requesting chat: ' + err);
        });
    })

    .on('audio', event => {
        console.log(prefix + ' audio event: ', event);
        const spChat = spChatApiFactory.findChatApi(event.from.name);
        spChat.requestChat(prefix + ':' + event.chat_id, {
            last_name: event.from.name,
            profile_url: event.from.url
        }, data => {
            // console.log('=== sending audio ===');
            spChat.sendFile(
                prefix + ':' + event.chat_id,
                data.chat_id,
                event.audio,
                event.message_id,
                'attachment',
                event.file_name,
                () => {}, err => {
                    console.error('message send error: ' + err);
                });
        }, err => {
            console.error('error requesting chat: ' + err);
        });
    })

    .on('location', event => {
        console.log(prefix + ' event: ', util.inspect(event, {depth: 5}));
        // var spChat = spChatApiFactory.findChatApi(event.from.name);
        // spChat.requestChat(prefix + ':' + event.chat_id, {
        //     last_name: event.from.name,
        //     profile_url: event.from.url
        // }, function(data){
        //     // console.log('=== sending location: ', event.location);
        //     db.collection('chats').findOne({_id: data.chat_id})
        //         .then(function(r){
        //             if(r && r.location_request_id){
        //                 // Respond to scenario-initiated location request
        //                 spChat.sendLocation(
        //                     prefix + ':' + event.chat_id,
        //                     data.chat_id,
        //                     r.location_request_id,
        //                     event.location,
        //                     function(){
        //                         db.collection('chats').findOneAndUpdate(
        //                             {_id: data.chat_id},
        //                             {$unset:{location_request_id: ''}});
        //                     },
        //                     function(err){
        //                         console.error(prefix + ' sendLocation failed: ', err);
        //                     })
        //             } else {
        //                 // Just send location to the agent(no previous location request)
        //                 var text;
        //                 if(event.location.url){
        //                     text = event.location.url;
        //                 } else {
        //                     text = 'https://maps.google.com/maps?z=12&t=m&q=loc:' +
        //                         event.location.latitude + '+' +
        //                         event.location.longitude +
        //                         '&output=embed';
        //                 }
        //                 spChat.sendText(
        //                     prefix + ':' + event.chat_id,
        //                     data.chat_id,
        //                     text,
        //                     event.message_id, function(){}, function(err){
        //                         console.error('message send error: ' + err);
        //                     });
        //             }
        //         });
        // })
    })

    .start();
}


function findChatApi(chatId){
    var prefix = chatId.substr(0, chatId.indexOf(':'))
    return chatApis[prefix]
}


function removePrefix(s){
    return s.substr(s.indexOf(':') + 1);
}

function renderTemplate(tpl, ctx){
    tpl = tpl || '';
    ctx = ctx || {};
    return tpl.replace(/{{(.*?)}}/g, function(x){
        return ctx[x.substring(2, x.length-2)] || '';
    })
}
