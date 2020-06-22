'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');

const bodyParser = require('body-parser');
require('body-parser-xml')(bodyParser);
const request = require('request-promise-native');
const requestStream = require('request');
const superagent = require('superagent');
const uuid1 = require('uuid/v1');

const sessions = require('./sessions');
const utils = require('./utils');

const vkMessagesSendUrl = 'https://api.vk.com/method/messages.send';
const vkMessagesUploadServerUrl = 'https://api.vk.com/method/photos.getMessagesUploadServer';
const vkPhotosSaveMessagesPhoto = 'https://api.vk.com/method/photos.saveMessagesPhoto';
const vkDocsUploadServerUrl = 'https://api.vk.com/method/docs.getMessagesUploadServer';
const vkDocsSaveUrl = 'https://api.vk.com/method/docs.save';
const vkVideoGetUrl = 'https://api.vk.com/method/video.get';
const vkUsersGetUrl = 'https://api.vk.com/method/users.get';
const vkUsersGetMessages = 'https://api.vk.com/method/messages.getById';
const VK_API_VERSION = '5.85';

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


const TMP_DIR = './tmp';
if (!fs.existsSync(TMP_DIR)){
    fs.mkdirSync(TMP_DIR);
}


class VkChatApi extends EventEmitter {

    constructor(options, express_app){
        super();
        assert.ok(options);
        assert.ok(options.groupAccessToken);
        assert.ok(options.groupId);
        assert.ok(options.adminUserLogin);
        assert.ok(options.adminUserPassword);
        assert.ok(express_app);
        assert.ok(express_app.use);
        this.adminUserLogin = options.adminUserLogin;
        this.adminUserPassword = options.adminUserPassword;
        this.groupAccessToken = options.groupAccessToken;
        this.groupId = options.groupId;
        this.confirmationCode = options.confirmationCode;
        // this.vk = new VK(options.groupAccessToken);
        express_app.use(bodyParser.urlencoded({ extended: false }));
        express_app.use(bodyParser.json());
        express_app.use(requestLogger)
        this._handleMessage = this._handleMessage.bind(this)
        this._handleReg = this._handleReg.bind(this)
        express_app.use('/vk', this._handleReg)
        express_app.use('/vk/webhook', this._handleMessage)
        this.sessions = sessions()
        this._onTextMessage = this._onTextMessage.bind(this)
        this._onImageMessage = this._onImageMessage.bind(this)
        this._onVideoMessage = this._onVideoMessage.bind(this)
        this._onDocMessage = this._onDocMessage.bind(this)
    }


    start(){}


    sendText(chatId, text){
        console.log(`vkChatApi.sendText, chatId: ${chatId}, text: ${text}`);
        return this._sendMessage(chatId, { message: text });
    }

    sendPhoto(chatId, fileUrl, fileName){
        console.log(`vkChatApi.sendPhoto, chatId: ${chatId}, fileUrl: ${fileUrl}, fileName: ${fileName}`);
        return this._getMessagesUploadServer(chatId)
        .then(res => {
            console.log(`vkChatApi.sendPhoto, _getMessagesUploadServer returned: ${JSON.stringify(res)}`);
            return this._downloadFile(fileUrl, res.serverUrl);
        })
        .then(({ filePath, uploadUrl }) => {
            console.log(`vkChatApi.sendPhoto, filePath: ${filePath}, uploadUrl: ${uploadUrl}`);
            return superagent.post(uploadUrl)
                .attach('photo', fs.createReadStream(filePath).on('close', () => {
                    fs.unlinkSync(filePath);
                }), fileName)
                .then(res => {
                    console.log(`vkChatApi.sendPhoto, upload server response: ${res.text}`);
                    return JSON.parse(res.text);
                })
                .catch(e => {
                    throw `vkChatApi.sendPhoto, upload photo error: ${JSON.stringify(e)}`;
                })
        })
        .then(res => {
            console.log(`vkChatApi.sendPhoto, upload server returned: ${JSON.stringify(res)}`);
            return this._saveMessagesPhoto(res);
        })
        .then(res => {
            console.log(`vkChatApi.sendPhoto, _saveMessagesPhoto returned: ${JSON.stringify(res)}`);
            if(res.error){
                throw res.error;
            }
            const photoId = res.response[0].id;
            const photoOwnerId = res.response[0].owner_id;
            const msg = {
                attachment: `photo${photoOwnerId}_${photoId}`,
            }
            return this._sendMessage(chatId, msg);
        })
        .catch(e => {
            console.error(`vkChatApi.sendPhoto, error: ${e}`);
        })
    }


    sendDoc(chatId, fileUrl, fileName){
        console.log(`vkChatApi.sendDoc, chatId: ${chatId}, fileUrl: ${fileUrl}, fileName: ${fileName}`);
        return this._getDocsUploadServer(chatId)
        .then(res => {
            console.log(`vkChatApi.sendDoc, _getDocsUploadServer returned: ${JSON.stringify(res)}`);
            return this._downloadFile(fileUrl, res.serverUrl);
        })
        .then(({ filePath, uploadUrl }) => {
            console.log(`vkChatApi.sendDoc, filePath: ${filePath}, uploadUrl: ${uploadUrl}`);
            console.log(`vkChatApi.sendDoc, filePath exists: ${fs.existsSync(filePath)}`);
            return superagent.post(uploadUrl)
                .attach('file', fs.createReadStream(filePath).on('close', () => {
                    fs.unlinkSync(filePath);
                }), fileName, {
                    contentType: 'application/octet-stream',
                })
                .then(res => {
                    console.log(`vkChatApi.sendDoc, upload server response: ${res.text}`);
                    return JSON.parse(res.text);
                })
                .catch(e => {
                    throw `vkChatApi.sendDoc, upload document error: ${JSON.stringify(e)}`;
                })
        })
        .then(res => {
            console.log(`vkChatApi.sendDoc, upload server returned: ${JSON.stringify(res)}`);
            return this._saveDoc(res);
        })
        .then(res => {
            console.log(`vkChatApi.sendDoc, _saveDoc returned: ${JSON.stringify(res)}`);
            if(res.error){
                throw res.error;
            }
            res = JSON.parse(res); // in case of success _saveDoc returns a string - a VK API weirdness
            res = res.response;
            const docId = res[0].id;
            const docOwnerId = res[0].owner_id;
            const msg = {
                attachment: `doc${docOwnerId}_${docId}`,
            }
            return this._sendMessage(chatId, msg);
        })
        .catch(e => {
            console.error(`vkChatApi.sendDoc, error: ${e}`);
        })
    }


    sendTyping(chat_id, cb){}


    endChat(chat_id, text, cb){}


    _handleReg(req, res, next){
        const {
            signature,
            timestamp,
            echostr,
            nonce
        } = req.query
        console.log(`signature: ${signature}, timestamp: ${timestamp}, echostr: ${echostr}, nonce: ${nonce}`)
        if(echostr){
            res.end(echostr)
        } else {
            next()
        }
    }


    _handleMessage(req, res, next){
        if (!req.body) {
            return next();
        }
        try {
            let msg = req.body
            let sender;

            console.log(`--------------------------------------------`)
            console.log(`--------------------------------------------`)
            console.log(`_handleMessage, msg:`, msg)
            console.log(`--------------------------------------------`)
            console.log(`--------------------------------------------`)
            switch(msg.type){
                case 'wall_post_new':
                case 'wall_reply_new':
                case 'wall_reply_edit':
                case 'board_post_new':
                case 'board_post_edit':
                    sender = msg.object.from_id;
                    break;
                case 'message_new':
                    sender = msg.object.user_id;
                    break;
            }

            // this._getUserMessages(sender, msg.object.id).then(function(res){
            //     console.log(res);
            // })

            switch(msg.type){
                case 'confirmation':
                    res.write(this.confirmationCode);
                    break;
                case 'message_new':
                case 'wall_post_new':
                case 'wall_reply_new':
                case 'wall_reply_edit':
                case 'board_post_new':
                case 'board_post_edit':
                    let target = this;
                    if(msg.object.attachments){
                        msg.object.attachments.forEach(function(item) {
                            switch (item.type){
                                case 'photo':
                                    let photo = '';
                                    if (item.photo.photo_1280) {
                                         photo = item.photo.photo_1280;
                                    } else if (item.photo.photo_807) {
                                        photo = item.photo.photo_807;
                                    } else if (item.photo.photo_604) {
                                        photo = item.photo.photo_604;
                                    } else if (item.photo.photo_130) {
                                        photo = item.photo.photo_130;
                                    } else if (item.photo.photo_75) {
                                        photo = item.photo.photo_75;
                                    }
                                    let imageObject = {
                                        id: msg.object.id,
                                        from_id: sender,
                                        photo: photo
                                    }
                                    target._onImageMessage(imageObject, sender);
                                    break;
                                case 'video':
                                    let cover = '';
                                        if (item.video.photo_800) {
                                             cover = item.video.photo_800;
                                        } else if (item.video.photo_640) {
                                            cover = item.video.photo_640;
                                        } else if (item.video.photo_320) {
                                            cover = item.video.photo_320;
                                        } else if (item.video.photo_130) {
                                            cover = item.video.photo_130;
                                        }
                                    let video = '';
                                    let videoObject = {
                                        id: msg.object.id,
                                        from_id: sender,
                                        owner_id: item.video.owner_id,
                                        video_id: item.video.id
                                    }
                                    target._onVideoMessage(videoObject, sender);
                                    break;
                                case 'audio':
                                    break;
                                case 'doc':
                                    let docObject = {
                                        id: msg.object.id,
                                        from_id: sender,
                                        file: item.doc.url
                                    }
                                    target._onDocMessage(docObject, sender);
                                    break;
                            }
                        })
                    }
                    let txt = msg.object.text || msg.object.body;
                    if(txt && txt.length > 0){
                        this._onTextMessage(msg.object, sender, txt);
                    }
                    res.write('ok');
                    break;
                case 'market_comment_new':
                case 'market_comment_edit':
                    let text = msg.object.text;
                    this._onTextMessage(msg.object, msg.object.from_id, text);
                    res.write('ok');
                    break;
                case 'photo_new':
                    this._onImageMessage(msg.object, sender);
                    res.write('ok');
                    break;
                case 'audio_new':
                    this._onAudioMessage(msg.object, sender)
                    res.write('ok');
                    break;
                case 'video_new':
                    this._onVideoMessage(msg.object, sender)
                    res.write('ok');
                    break;
                default:
                    console.log(`_handleMessage: Unexpected message type: "${msg.type}"`)
            }
            res.status(200).end()
        } catch(e) {
            console.error('_handleMessage:', e)
            res.status(500).end()
        }
    }


    // TODO: refactor
    _getMessagesUploadServer(peerId){
        console.log(`vkChatApi._getMessagesUploadServer, peerId: ${peerId}`);
        return request.get(vkMessagesUploadServerUrl, {
            qs: {
                access_token: this.groupAccessToken,
                peer_id: peerId,
                v: VK_API_VERSION,
            },
            json: true,
            timeout: REQUEST_TIMEOUT,
        }).then(res => {
            if(res.error){
                throw res.error;
            }
            return {
                serverUrl: res.response.upload_url,
            }
        })
    }


    // TODO: refactor
    _getDocsUploadServer(peerId){
        console.log(`vkChatApi._getDocsUploadServer, peerId: ${peerId}`);
        return request.get(vkDocsUploadServerUrl, {
            qs: {
                access_token: this.groupAccessToken,
                peer_id: peerId,
                v: VK_API_VERSION,
            },
            json: true,
            timeout: REQUEST_TIMEOUT,
        }).then(res => {
            return {
                serverUrl: res.response.upload_url,
            }
        })
    }


    _saveMessagesPhoto({ photo, server, hash }) {
        console.log(`vkChatApi._saveMessagesPhoto, photo: ${photo}, server: ${server}, hash: ${hash}`);
        return request.post(vkPhotosSaveMessagesPhoto, {
            form: {
                photo,
                server,
                hash,
            },
            qs: {
                // peer_id,
                access_token: this.groupAccessToken,
                v: VK_API_VERSION,
            },
            json: true,
        });
    }


    _saveDoc({ file }) {
        console.log(`vkChatApi._saveDoc, file: ${file}`);
        return request.post(vkDocsSaveUrl, {
            form: {
                file,
            },
            qs: {
                access_token: this.groupAccessToken,
                v: VK_API_VERSION,
            }
        });
    }


    _sendMessage(chatId, msg){
        console.log(`vkChatApi._sendMessage, chatId: ${chatId}, msg: ${JSON.stringify(msg)}`);
        const sem = this.sessions.findOrCreate(chatId).sem;
        return sem.takeWithPromise().then(() => {
            return request.post(vkMessagesSendUrl, {
                qs: {
                    access_token: this.groupAccessToken,
                    user_id: chatId,
                    peer_id: this.groupId,
                    from_group: 1,
                    v: VK_API_VERSION,
                },
                form: msg,
                timeout: REQUEST_TIMEOUT,
            })
            .then(body => {
                console.log(`vkChatApi._sendMessage, response body: ${body}`);
                return body;
            })
            .then(body => JSON.parse(body))
            .then(body => {
                sem.leave();
                if(body && body.error){
                    throw body.error;
                }
            })
            .catch(e => {
                sem.leave();
                console.error(`vkChatApi._sendMessage, error: ${e}`);
                throw e
            })
        })
    }


    _getVideo(user_id, owner_id, video_id){
        let adminUserLogin = this.adminUserLogin;
        let adminUserPassword = this.adminUserPassword;
        let s = this.sessions[user_id]
        let player = {
            playerUrl: ''
        }
        if(s && s.player){
            return Promise.resolve(player)
        } else {
            return new Promise((resolve, reject) => {
                vkapi.authorize({
                    login:    adminUserLogin,
                    password: adminUserPassword,
                }).then(function(auth){
                    request.get(`${vkVideoGetUrl}?videos=${owner_id}_${video_id}&access_token=${auth.access_token}`, (err, res, body) => {
                        if(err){
                            console.error(err)
                            reject(err)
                        } else {
                            if(res.statusCode !== 200){
                                let err = new Error('Unexpected status code: ' + res.statusCode)
                                console.error(err)
                                reject(err)
                            } else {

                                let data = JSON.parse(body).response;
                                if(typeof data !== 'undefined'){
                                    resolve({
                                        playerUrl: data[1].player,
                                        title: data[1].title
                                    })
                                }
                            }
                        }
                    })
                })
            })
        }
    }

    _getUserMessages(userId, msgId){

        let groupAccessToken = this.groupAccessToken;
        let s = this.sessions[userId]
        let msgs = {
            res: '',
        }
        if(s && s.msgs){
            return Promise.resolve(msgs)
        } else {
            return new Promise((resolve, reject) => {
                request.get(`${vkUsersGetMessages}?access_token=${groupAccessToken}&message_ids={msgId}&v=${VK_API_VERSION}`, (err, res, body) => {
                    if(err){
                        console.error('_getUserMessages: ', err)
                        reject(err)
                    } else {
                        if(res.statusCode !== 200){
                            let err = new Error('Unexpected status code: ' + res.statusCode)
                            console.error('_getUserMessages: ', err)
                            reject(err)
                        } else {
                            try{
                                // let data = JSON.parse(body).response[0];
                                // if(typeof data !== 'undefined'){
                                    resolve({
                                        res: body
                                    })
                                // }
                            } catch (e) {
                                console.log('_getUserMessages: Can`t get user message by Id');
                            }
                        }
                    }
                })
            })
        }
    }


    _getUserProfile(userId){
        console.log('_getUserProfile')
        let s = this.sessions[userId]
        let from = {
            name: userId
        }
        if(s && s.from){
            return Promise.resolve(from)
        } else {
            return new Promise((resolve, reject) => {
                request.get(`${vkUsersGetUrl}?access_token=${this.groupAccessToken}&user_ids=${userId}&fields=photo_50&name_case=nom&v=${VK_API_VERSION}`, (err, res, body) => {
                    if(err){
                        console.error('_getUserProfile:', err)
                        reject(err)
                    } else {
                        if(res.statusCode !== 200){
                            let err = new Error('Unexpected status code: ' + res.statusCode)
                            console.error('_getUserProfile:', err)
                            reject(err)
                        } else {
                            try{
                                console.log(`_getUserProfile, body: ${body}`);
                                let data = JSON.parse(body).response[0];
                                if(typeof data !== 'undefined'){
                                    resolve({
                                        name: `${data.first_name} ${data.last_name}`,
                                        url: data.photo_50
                                    })
                                }
                            } catch (e) {
                                console.log('_getUserProfile: Can`t get user profile');
                            }
                        }
                    }
                })
            })
        }
    }


    _downloadFile(fileUrl, uploadUrl){
        return new Promise((resolve, reject) => {
            const filePath = `${TMP_DIR}/${uuid1()}`;
            console.log(`vkChatApi._downloadFile, fileUrl: ${fileUrl}, filePath: ${filePath}`);
            requestStream.get(fileUrl)
            .on('error', err => {
                console.log(`vkChatApi._downloadFile, error reading from ${fileUrl}, error: ${err}`);
                reject(err);
            })
            .pipe(fs.createWriteStream(filePath)
                .on('finish', () => {
                    console.log(`vkChatApi._downloadFile, finished writing to ${filePath}`);
                    resolve({ filePath, uploadUrl });
                })
                .on('error', err => {
                    console.log(`vkChatApi._downloadFile, error writing to ${filePath}, error: ${err}`);
                    reject(err);
                })
            );
        });
    }



    _onTextMessage({id}, from_id, text){
        console.log('_onTextMessage')
        this._getUserProfile(from_id).then(from => {
            this.emit('text', {
                message_id: id,
                chat_id: from_id,
                text: text,
                from,
            })
        })
    }


    _onImageMessage({id, photo}, from_id){
        this._getUserProfile(from_id).then(from => {
            this.emit('image', {
                message_id: id,
                chat_id: from_id,
                url: photo,
                from,
            })
        })
    }


    _onVideoMessage({id, cover, video, owner_id, video_id}, from_id){
        this._getUserProfile(from_id).then(from => {
            this._getVideo(from_id, owner_id, video_id).then(player => {
                this.emit('text', {
                    message_id: id,
                    chat_id: from_id,
                    text: `${player.title}\r\n${player.playerUrl}`,
                    from,
                })
            })
        })
    }


    _onDocMessage({id, file}, from_id){
        this._getUserProfile(from_id).then(from => {
            this.emit('file', {
                message_id: id,
                chat_id: from_id,
                url: file,
                file_name: utils.fileNameFromURL(file),
                from,
            })
        })
    }


}


module.exports = {
    VK_API_VERSION,
    VkChatApi,
    vkMessagesUploadServerUrl,
    vkPhotosSaveMessagesPhoto,
    vkMessagesSendUrl,
    vkDocsUploadServerUrl,
    vkDocsSaveUrl,
}
