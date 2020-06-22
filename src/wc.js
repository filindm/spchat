'use strict';


const assert = require('assert')
const crypto = require('crypto')
const EventEmitter = require('events')
const fs = require('fs')
const tmp = require('tmp')
const { spawn } = require('child_process')
const sessions = require('./sessions')
const request = require('request')
const bodyParser = require('body-parser')
require('body-parser-xml')(bodyParser)
const FormData = require('form-data')

// const WeChatApiUrl = 'https://api.wechat.com/cgi-bin/message/custom/send'
// const WeChatMediaUrl  = 'https://api.wechat.com/cgi-bin/media/upload'
// const WeChatTokenUrl  = 'https://api.wechat.com/cgi-bin/token?grant_type=client_credential&'
const WeChatApiUrl    = 'https://api.weixin.qq.com/cgi-bin/message/custom/send'
const WeChatMediaUrl  = 'https://api.weixin.qq.com/cgi-bin/media/upload'
const WeChatTokenUrl  = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&'
const WeChatUserInfoUrl = 'https://api.wechat.com/cgi-bin/user/info'
const WeChatMediaGetUrl = 'http://file.api.wechat.com/cgi-bin/media/get'


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


const TOKEN_REFRESH_TIMEOUT = 7000 // access token expires after 7200 sec; allow some time (200 sec) to retrieve a new one


class WeChatApi extends EventEmitter {

    constructor(options, express_app){
        super()
        assert.ok(options)
        assert.ok(options.appId)
        assert.ok(options.appSecret)
        assert.ok(options.token)
        assert.ok(express_app)
        assert.ok(express_app.use)
        this.appId = options.appId
        this.appSecret = options.appSecret
        this.token = options.token
        express_app.use(bodyParser.xml({xmlParseOptions: {explicitArray: false}}))
        express_app.use(requestLogger)
        this.handleMessage = this.handleMessage.bind(this)
        this.verifySignature = this.verifySignature.bind(this)
        express_app.use('/wc', this.handleMessage)
        this.sessions = sessions()
        this._onTextMessage = this._onTextMessage.bind(this)
        this._onImageMessage = this._onImageMessage.bind(this)
        this._onAudioMessage = this._onAudioMessage.bind(this)
        this._onLocationMessage = this._onLocationMessage.bind(this)
        this._renewAccessToken = this._renewAccessToken.bind(this)
    }

    start(){
        this._renewAccessToken()
        setInterval(this._renewAccessToken, TOKEN_REFRESH_TIMEOUT * 1000)
    }

    sendText(chat_id, text, cb){
        console.log(`wechat sendText, chat_id: ${chat_id}, text: ${text}`)
        let sem = this.sessions.findOrCreate(chat_id).sem
        let access_token = this.accessToken
        sem.take(() => {
            const msg = {
                touser: chat_id,
                msgtype: 'text',
                text: {
                    content: text
                }
            }
            request
            .post(WeChatApiUrl, {
                qs: {access_token},
                json: true,
                body: msg
            }, (err, res, body) => {
                sem.leave()
                if(err){
                    cb && cb(err)
                } else {
                    if(res.statusCode !== 200){
                        cb && cb(new Error('Unexpected status code: ' + res.statusCode))
                    } else {
                        cb && cb()
                    }
                }
            })
        })
    }

    sendPhoto(chat_id, file_url, file_name){
        console.log(`wechat sendPhoto, chat_id: ${chat_id}, file_url: ${file_url}`)
        let sem = this.sessions.findOrCreate(chat_id).sem
        let access_token = this.accessToken
        sem.take(() => {
            this._uploadPhoto(request(file_url), (err, media_id) => {
                console.log(`wechat sendPhoto, mediaId: ${media_id}`)
                if(err){
                    sem.leave()
                } else {
                    const msg = {
                        touser: chat_id,
                        msgtype: 'image',
                        image: {
                            media_id
                        }
                    }
                    console.log(`wechat sendPhoto, msg: ${JSON.stringify(msg)}`)
                    request.post(WeChatApiUrl, {
                        qs: {access_token},
                        json: true,
                        body: msg
                    }, (err, res, body) => {
                        console.log(`wechat sendPhoto, post done, err: ${err}, res: ${res}, body: ${body}`)
                        sem.leave()
                        if(err){
                            // cb && cb(err)
                        } else {
                            if(res.statusCode !== 200){
                                // cb && cb(new Error('wechat sendPhoto, Unexpected status code: ' + res.statusCode))
                            } else {
                                // cb && cb()
                            }
                        }
                    })
                }
            })
        })
    }

    sendDoc(chat_id, file_url, file_name){
        console.log(`wechat sendDoc, chat_id: ${chat_id}, file_url: ${file_url}, file_name: ${file_name} - NOT IMPLEMENTED YET`)
    }

    sendTyping(chat_id, cb){}

    endChat(chat_id, text, cb){}

    _uploadPhoto(stream, cb) {
        console.log(`wechat _uploadPhoto`)
        tmp.file((err, path, fd, cleanupCallback) => {
            if(err){
                cb && cb(err)
            } else {
                let dest = fs.createWriteStream(path)
                stream.pipe(dest)
                stream.on('end', () => {
                    const stats = fs.statSync(path)
                    console.log(`path: ${path}, size: ${stats.size}`)
                    const curl = spawn('curl', [
                        '-F',
                        `media=@${path};filename=abc.jpg`,
                        `${WeChatMediaUrl}?access_token=${this.accessToken}&type=image`
                    ])
                    let curl_data = []
                    curl.stdout.on('data', (data) => {
                        curl_data.push(data)
                    })
                    curl.on('close', code => {
                        if(code !== 0){
                            console.error(`curl exited with code ${code}`)
                        } else {
                            curl_data = Buffer.concat(curl_data).toString()
                            console.log(`curl_data: ${curl_data}`)
                            try{
                                curl_data = JSON.parse(curl_data)
                                if(curl_data.media_id){
                                    console.log(`curl_data.media_id: ${curl_data.media_id}`)
                                    cb && cb(null, curl_data.media_id)
                                } else {
                                    console.error(curl_data)
                                    cb && cb(curl_data)
                                }
                            } catch(e){
                                cb && cb(err)
                            }
                        }
                        cleanupCallback()
                    })
                })
            }
        })
    }

    _uploadAudio(stream, cb) {
        console.log(`wechat _uploadAudio`)
        tmp.file((err, path, fd, cleanupCallback) => {
            if(err){
                cb && cb(err)
            } else {
                let dest = fs.createWriteStream(path)
                stream.pipe(dest)
                stream.on('end', () => {
                    const stats = fs.statSync(path)
                    console.log(`path: ${path}, size: ${stats.size}`)
                    const curl = spawn('curl', [
                        '-F',
                        `media=@${path};filename=abc.jpg`,
                        `${WeChatMediaUrl}?access_token=${this.accessToken}&type=voice`
                    ])
                    let curl_data = []
                    curl.stdout.on('data', (data) => {
                        curl_data.push(data)
                    })
                    curl.on('close', code => {
                        if(code !== 0){
                            console.error(`curl exited with code ${code}`)
                        } else {
                            curl_data = Buffer.concat(curl_data).toString()
                            console.log(`curl_data: ${curl_data}`)
                            try{
                                curl_data = JSON.parse(curl_data)
                                if(curl_data.media_id){
                                    console.log(`curl_data.media_id: ${curl_data.media_id}`)
                                    cb && cb(null, curl_data.media_id)
                                } else {
                                    console.error(curl_data)
                                    cb && cb(curl_data)
                                }
                            } catch(e){
                                cb && cb(err)
                            }
                        }
                        cleanupCallback()
                    })
                })
            }
        })
    }

    handleMessage(req, res, next){
        const {
            signature,
            timestamp,
            echostr,
            nonce,
        } = req.query
        console.log(`signature: ${signature}, timestamp: ${timestamp}, echostr: ${echostr}, nonce: ${nonce}`)
        if(!this.verifySignature(signature, timestamp, nonce)){
            res.status(403).end()
            return
        }
        if(echostr){
            res.end(echostr)
            return
        }
        if(req.body){
            try {
                let msg = req.body
                console.log(`handleMessage, msg: ${JSON.stringify(msg)}`)
                switch(msg.xml.MsgType){
                    case 'text':
                        this._onTextMessage(msg.xml)
                        break;
                    case 'image':
                        this._onImageMessage(msg.xml)
                        break;
                    case 'voice':
                        this._onAudioMessage(msg.xml)
                        break;
                    case 'location':
                        this._onLocationMessage(msg.xml)
                        break;
                    default:
                        throw new Error(`Unexpected message type: "${msg.xml.MsgType}"`)
                }
                res.status(200).end()
            } catch(e) {
                console.error(e)
                res.status(500).end()
            }
        } else {
            next()
        }
    }

    verifySignature(signature, timestamp, nonce){
        return crypto.createHash('sha1').update([timestamp, nonce, this.token].sort().join('')).digest('hex') === signature
    }

    _getUserProfile(FromUserName){
        const chat_id = FromUserName
        let s = this.sessions[chat_id]
        let from = {
            name: FromUserName
        }
        if(s && s.from){
            return Promise.resolve(from)
        } else {
            return new Promise((resolve, reject) => {
                request.get(WeChatUserInfoUrl, {
                    qs: {access_token: this.accessToken, openid: FromUserName, lang: 'en'},
                    json: true,
                }, (err, res, body) => {
                    if(err){
                        console.error(err)
                        reject(err)
                    } else {
                        if(res.statusCode !== 200){
                            let err = new Error('Unexpected status code: ' + res.statusCode)
                            console.error(err)
                            reject(err)
                        } else {
                            console.log(`userProfile: ${JSON.stringify(body)}`)
                            resolve({
                                name: body.nickname
                            })
                        }
                    }
                })
            })
        }
    }


    _onTextMessage({ToUserName, FromUserName, CreateTime, MsgType, Content, MsgId}){
        this._getUserProfile(FromUserName).then(from => {
            this.emit('text', {
                message_id: MsgId,
                chat_id: FromUserName,
                text: Content,
                from
            })
        })
    }


    _onImageMessage({ToUserName, FromUserName, CreateTime, MsgType, PicUrl, MediaId, MsgId}){
        this._getUserProfile(FromUserName).then(from => {
            this.emit('image', {
                message_id: MsgId,
                chat_id: FromUserName,
                url: PicUrl,
                from
            })
        })
    }


    _onAudioMessage({ToUserName, FromUserName, CreateTime, MsgType, Format, MediaId, MsgId}){
        let token = this.accessToken;
        this._getUserProfile(FromUserName).then(from => {
            this.emit('text', {
                message_id: MsgId,
                chat_id: FromUserName,
                text: `Voice record. Click to download:\r\n${WeChatMediaGetUrl}?access_token=${token}&media_id=${MediaId}`,
                from
            })
        })
    }


    _onLocationMessage({ToUserName, FromUserName, CreateTime, MsgType, Location_X, Location_Y, Scale, Label, MsgId}){
        this._getUserProfile(FromUserName).then(from => {
            this.emit('location', {
                message_id: MsgId,
                chat_id: FromUserName,
                location: {
                    latitude: Location_X,
                    longitude: Location_Y,
                    url: null
                },
                from
            })
        })
    }


    _renewAccessToken(){
        console.log(`wc: _renewAccessToken`)
        // WeChat returns json: {"access_token": "<access_token>", "expires_in": 7200}
        request.get(WeChatTokenUrl + `appid=${this.appId}&secret=${this.appSecret}`, (err, res, body) => {
            if(err){
                console.error(err)
            } else if(res.statusCode >= 400){
                console.error(`wc: _renewAccessToken: status code: ${res.statusCode}`)
            } else {
                try {
                    body = JSON.parse(body)
                    this.accessToken = body.access_token
                    console.log(`wc: _renewAccessToken: new access token: ${this.accessToken}`)
                } catch(e){
                    console.error(`wc: _renewAccessToken: error while parsing body, error: ${e}, body: ${body}`)
                }
            }
        })
    }
}


module.exports = {
    WeChatApi,
    WeChatApiUrl,
    WeChatMediaUrl,
}
