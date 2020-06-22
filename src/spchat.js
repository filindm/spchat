////////////////////////////////////////////////////////////////////////////////
'use strict';

const EventEmitter = require('events');
const util = require('util');
const assert = require('assert');
const fs = require('fs');
const uuid1 = require('uuid/v1');

const request = require('request');
const requestPromise = require('request-promise-native');
const slugify = require('slugify');


////////////////////////////////////////////////////////////////////////////////
var spchat = {};

const TMP_DIR = './tmp';
if (!fs.existsSync(TMP_DIR)){
    fs.mkdirSync(TMP_DIR);
}

spchat.createChatApiFactory = function(cfg){
    var chatApis = {};
    for(var k in cfg.apps){
        if(cfg.apps.hasOwnProperty(k)){
            chatApis[k] = new ChatApi(Object.assign(cfg.apps[k], {
                webUrl: cfg.webUrl
            }));
            console.log("created chatApi \"" + k + "\"");
        }
    }
    return {
        findChatApi: function(userId){
            for(var k in cfg.routes){
                if(cfg.routes.hasOwnProperty(k)){
                    if(cfg.routes[k].indexOf(userId) !== -1){
                        console.log("user " + userId + " is routed to " + k);
                        return chatApis[k];
                    }
                }
            }
            console.log("no matching found for user " + userId +
                ", returning default route");
            return chatApis[cfg.routes.default];
        },
        forEach: function(cb){
            Object.keys(chatApis).forEach(function(k){
                cb && cb(chatApis[k]);
            })
        }
    }
}

spchat.createChatApi = function(cfg){
    return new ChatApi(cfg)
}


////////////////////////////////////////////////////////////////////////////////
function ChatApi(cfg){

    var self = this;
    EventEmitter.call(self);

    var appId = getRequiredParameter(cfg, 'appId');
    var tenant = getRequiredParameter(cfg, 'tenant');
    var host = getRequiredParameter(cfg, 'host');
    var ssl = cfg.ssl !== undefined ? cfg.ssl : false;
    var port = cfg.port !== undefined ? cfg.port : (ssl ? 9443 : 98);
    var webUrl = cfg.webUrl;

    assert.ok(webUrl, 'webUrl not set')

    function getRequiredParameter(cfg, name){
        var val = cfg[name];
        if(val === undefined || val === null || val === ''){
            throw 'Missing required parameter "' + name +'"';
        }
        return val;
    }

    function baseUrl(){
        return (ssl ? 'https://' : 'http://') + host + ':' + port;
    }

    function authHeader(userId){
        return 'MOBILE-API-140-327-PLAIN appId="' + appId + '", clientId="' + userId + '"';
    }

    this.toString = function(){
        return 'ChatApi, appId: ' + appId + ', tenant: ' + tenant +
            ', base url: ' + baseUrl();
    }


    // this.available = function(userId, success, error){

    //     var uri = '/clientweb/api/v1/availability?tenantUrl=' + tenant;

    //     request.get(uri, function(err, resp, body){
    //         console.log('Status code: ' + resp.statusCode;
    //         if(resp.statusCode < 400){
    //             // resp.bodyHandler(function(body){
    //                 try {
    //                     var data = JSON.parse(body);
    //                     if(success){
    //                         try{
    //                             success(data.chat === 'available');
    //                         } catch(e){}
    //                     }
    //                 } catch(e){
    //                     logger.error(e);
    //                     if(error){
    //                         try{
    //                             error('' + e);
    //                         } catch(e){}
    //                     }
    //                 }
    //             // })
    //         } else {
    //             if(error){
    //                 try{
    //                     error('' + resp.statusCode() + ': ' + resp.statusMessage());
    //                 } catch(e){}
    //             }
    //         }

    //     })
    //     .putHeader('Authorization', authHeader(userId))
    //     .putHeader('User-Agent', 'MobileClient')
    //     .end();
    // }


    this.requestChat = function(userId, parameters, success, error){

        var url = baseUrl() + '/clientweb/api/v1/chats?tenantUrl=' + tenant;

        var data = {
            phone_number: '',
            from: userId,
            parameters: parameters
        }

        requestPromise.post({
            url: url,
            headers: {
                'Authorization': authHeader(userId),
                'User-Agent': 'MobileClient',
                'Content-Type': 'application/json; charset=UTF-8'
            },
            json: true,
            body: data,
            timeout: 5000,
        }).then(body => {
            onResponse(body);
        }).catch(err => {
            console.error('Error in requestChat: '+ err);
        });

        function onResponse(data){
            try {
                if(!sessionExists(data.chat_id)){
                    startPollingEvents(data.chat_id);
                }
                if(success){
                    try{
                        success(data);
                    } catch(e){}
                }
            } catch(e){
                console.error(e);
                if(error){
                    try{
                        error('' + e);
                    } catch(e){}
                }
            }
        }


        function startPollingEvents(chatId){

            var POLLING_INTERVAL = 3000;

            findOrCreateSession(chatId)
            console.log('Chat ' + chatId + ' started')
            setTimeout(pollEvents, POLLING_INTERVAL)

            function pollEvents(){

                var url = baseUrl() + '/clientweb/api/v1/chats/' + chatId +
                    '/events?tenantUrl=' + tenant;

                request.get({
                    url: url,
                    headers: {
                        'Authorization': authHeader(userId),
                        'User-Agent': 'MobileClient',
                    },
                    json: true,
                    timeout: 15000,

                }, function(err, res, data){
                    if(err){
                        // console.error('spchat: poll events error(1): ', err);
                    } else {
                        if(res.statusCode == 200){
                            try {
                                if(data && data.events){
                                    processEvents(data.events, chatId, userId);
                                } else {
                                    console.warn('spchat: unexpected data received: ', data);
                                }
                            } catch(e){
                                console.error('spchat: poll events error(2): ', e);
                            }
                        } else {
                            //console.log('spchat: poll events status code: ',
                            //    res.statusCode);
                        }
                    }
                    if(sessionExists(chatId)){
                        setTimeout(pollEvents, POLLING_INTERVAL)
                    } else {
                        console.log('Chat ' + chatId + ' stopped')
                    }
                })
            }
        }
    }


    this.sendText = function(userId, chatId, text, msgId, success, error){
        var url = baseUrl() + '/clientweb/api/v1/chats/' + chatId +
            '/events?tenantUrl=' + tenant;
        var evt = {
            event: 'chat_session_message',
            msg_id: chatId + ':' + msgId,
            msg: text
        }
        sendClientEvents(userId, chatId, [evt], success, error);
    }


    this.sendFormData = function(userId, chatId, formName, requestId, formData, success, error){
        var evt = {
            event: 'chat_session_form_data',
            form_request_id: requestId,
            form_name: formName,
            data: formData
        }
        sendClientEvents(userId, chatId, [evt], success, error);
    }


    this.sendLocation = function(userId, chatId, req_id, location, success, error){
        if(req_id){
            var evt = {
                event: 'chat_session_form_data',
                form_request_id: req_id,
                form_name: 'RequestLocation',
                data: {
                    'location_lat': location.latitude || '',
                    'location_lon': location.longitude || '',
                    'location_url': location.url || ''
                }
            }
            sendClientEvents(userId, chatId, [evt], success, error);
        }
    }


    this.sendFile = function(userId, chatId, srcUrl, msgId, file_type, file_name, success, error){

        console.log(`SpChatApi.sendFile, userId: ${userId}, chatId: ${chatId}, srcUrl: ${srcUrl}, msgId: ${msgId}, file_type: ${file_type}, file_name: ${file_name}`);

        let req = null;
        if(typeof srcUrl === 'string' || srcUrl instanceof String){
            req = request.get(srcUrl);
        } else {
            // srcUrl is an already configured request
            // TODO: refactor this hack somehow
            req = srcUrl;
        }
        req.on('response', res => {
            if(res.statusCode === 200){
                const filePath = `${TMP_DIR}/${uuid1()}`
                // const filePath = `${TMP_DIR}/1.txt`
                res.pipe(fs.createWriteStream(filePath)).on('finish', () => {
                    console.log(`********* filePath: ${filePath} ************`);
                    const url = `${baseUrl()}/clientweb/api/v1/files?tenantUrl=${tenant}`;
                    request.post({
                        url,
                        formData: {
                            file: fs.createReadStream(filePath)
                        },
                        headers: {
                            'Authorization': authHeader(userId),
                            'User-Agent': 'MobileClient',
                        },
                        timeout: 5000,

                    }, (err, resp, data) => {
                        console.log(`SpChatApi.sendFile, request result, err: ${err}, resp: ${JSON.stringify(resp)}, data: ${data}`);
                        fs.unlinkSync(filePath)
                        try {
                           data = JSON.parse(data);
                            console.log(`SpChatApi.sendFile, err: ${err}, status: ${resp.statusCode}, content type: ${resp.headers['content-type']}, data: ${JSON.stringify(data)}`);
                            if(err){
                                return console.error(`spcSpChatApi.sendFile: file upload failed: ${err}`);
                            }
                            if(resp.statusCode !== 200){
                                return console.error(`SpChatApi.sendFile: file upload failed: ${resp.statusCode}, ${resp.statusMessage}`);
                            }
                            var evt = {
                                event: 'chat_session_file',
                                msg_id: '', // This field must be empty, otherwise Client Web Server return 500 Server error; looks like a bug...
                                file_type, // image|attachment
                                file_name,
                                file_id: data.file_id
                            }
                            // console.log('spchat: before sendClientEvents: ', evt);
                            sendClientEvents(userId, chatId, [evt], success, error);
                        } catch(e){
                           console.log(`SpChatApi.sendFile: file can't be sent`);
                            var evt = {
                                event: 'chat_session_message',
                                msg_id: `${chatId}:${msgId}`,
                                msg: "File can't be sent"
                            }
                           sendClientEvents(userId, chatId, [evt], success, error);
                        }
                    })
                })
            } else {
                console.warn(`SpChatApi.sendFile, can't load file, srcUrl: ${srcUrl}, statusCode: ${res.statusCode}, statusMessage: ${res.statusMessage}`);
            }
        })
    }

    this.getFile = function(userId, chatId, fileId){
        console.log('SpChatApi.getFile, userId: ' + userId + ', chatId: ' + chatId +
            ', fileId: ' + fileId);
        const url = `${baseUrl()}/clientweb/api/v1/chats/${chatId}/files/${fileId}`;
        console.log(`$$$ url: ${url}`);
        return requestPromise.get({
            url: url,
            headers: {
                'Authorization': authHeader(userId),
                'User-Agent': 'MobileClient',
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify({
                fileId: fileId,
                chatId: chatId
            }),
            timeout: 5000,
            encoding: null,
        });
    }

    function sendClientEvents(userId, chatId, events, success, error){

        var url = baseUrl() + '/clientweb/api/v1/chats/' + chatId +
            '/events?tenantUrl=' + tenant;
        var data = {events: events}

        console.log('spchat: sending events ( => SP ): ', util.inspect(data, {depth: 5}));

        request.post({
            url: url,
            headers: {
                'Authorization': authHeader(userId),
                'User-Agent': 'MobileClient',
                'Content-Type': 'application/json; charset=UTF-8'
            },
            json: true,
            body: data,
            timeout: 5000,

        }, function(err, resp, body){
            if(err){
                console.error('spchat: ', err);
            } else {
                onResponse(resp, body);
            }
        })

        function onResponse(resp, data){
            // console.log('sendClientEvents onResponse, data: ' + JSON.stringify(data));
            console.log('spchat: sendClientEvents onResponse, status code: ' + resp.statusCode +
                ', status message: ' + resp.statusMessage)
            if(resp.statusCode === 200){
                if(data && data.events){
                    //processEvents(data.events, chatId, userId);
                    console.log(' === send client events')
                    data.events.forEach((e) => {
                        console.log(' ~~~ ' + e.event)
                    })
                    console.log(' ======================')
                }
                if(success){
                    success();
                }
            } else {
                if(error){
                    error('' + resp.statusCode + ': ' + resp.statusMessage);
                }
            }
        }
    }

    function processEvents(events, chatId, userId){
        events.forEach(function(v){
            v.chatId = chatId;
            v.userId = userId;
            console.log('spchat: sending event ( SP => ): ', v);
            if(v.event === 'chat_session_file'){
                let data = {
                    mime: v.file_type === 'image' ? 'image/jpeg': 'application/octet-stream',
                    userId: userId,
                    chatId: chatId,
                    fileId: v.file_id
                }
                data = new Buffer(JSON.stringify(data), 'utf8').toString('base64')
                v.file_url = `${webUrl}/file/${data}/${slugify(v.file_name)}`
            } else if(v.event === 'chat_session_ended'){
                removeSession(chatId)
            }
            self.emit(v.event, v);
        })
    }

    var sessions = {};

    function sessionExists(chat_id){
        return sessions.hasOwnProperty(chat_id)
    }

    function findOrCreateSession(chat_id){
        if(!sessionExists(chat_id)){
            sessions[chat_id] = {
                last_msg_id: -1
            }
        }
        return sessions[chat_id];
    }

    function removeSession(chat_id){
        delete sessions[chat_id];
    }

}

util.inherits(ChatApi, EventEmitter);


////////////////////////////////////////////////////////////////////////////////
module.exports = spchat;
