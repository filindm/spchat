'use strict';


const chai = require('chai');
const expect = chai.expect;
const utils = require('../src/utils');


describe('utils', () => {

    describe('fileNameFromURL', () => {

        it('should return last part of URL path', done => {
            const url = 'http://abc.com/some/path/filename.jpg?abc=def';
            expect(utils.fileNameFromURL(url)).to.equal('filename.jpg');
            done();
        })

        it('should gracefully handle empty input', done => {
            expect(utils.fileNameFromURL('')).to.equal('');
            expect(utils.fileNameFromURL(null)).to.equal('');
            done();
        })
    })
})

// describe('WeChat', () => {
//
//     let mitm
//     const express_app = {
//         use: () => {}
//     }
//
//     beforeEach(() => {
//         mitm = Mitm()
//     })
//
//     afterEach(() => {
//         mitm.disable()
//     })
//
//     describe('sendText', () => {
//
//         const userId = 'user123'
//         const text = 'Hello World'
//         const msg = {
//             touser: userId,
//             msgtype: 'text',
//             text: {
//                 content: text
//             }
//         }
//         const wc = new WeChatApi({appId, appSecret}, express_app)
//         wc.accessToken = accessToken
//
//         it('should send correct message', done => {
//             let lastUrl
//             const interceptors = [
//                 (req, res) => {
//                     expect(lastUrl.href).to.equal(WeChatApiUrl + '?access_token=' + accessToken)
//                     expect(req.method).to.equal('POST')
//                     expect(req.headers['content-type']).to.equal('application/json')
//                     jsonBody(req, (err, body) => {
//                         if(err){
//                             done(err)
//                         } else {
//                             expect(body).to.deep.equal(msg)
//                             res.statusCode = 200
//                             res.end('ok')
//                         }
//                     })
//                 },
//             ]
//             mitm.on('connect', (sock, opts) => {
//                 lastUrl = opts.url
//             }).on('request', (req, res) => {
//                 if(!interceptors){
//                     throw new Error('unexpected request')
//                 }
//                 interceptors.shift()(req, res)
//             })
//             wc.sendText(userId, text, err => {
//                 expect(interceptors).to.be.empty
//                 done(err)
//             })
//         })
//     })
//
//
//     describe('sendPhoto', () => {
//
//         const userId = 'user123'
//         const fileUrl = 'http://nowhere.nothing'
//         const imageBytes = '<image bytes>'
//         const media_id = 'photo234'
//         const msg = {
//             touser: userId,
//             msgtype: 'image',
//             image: {
//                 media_id
//             }
//         }
//         const wc = new WeChatApi({appId, appSecret}, express_app)
//         wc.accessToken = accessToken
//
//         it('should send correct sequence of messages', done => {
//             let lastUrl
//             const interceptors = [
//                 (req, res) => {
//                     expect(lastUrl.href).to.equal(new URL(fileUrl).href)
//                     expect(req.method).to.equal('GET')
//                     res.statusCode = 200
//                     res.setHeader('Content-Type', 'image/jpeg')
//                     res.end(imageBytes)
//                 },
//                 (req, res) => {
//                     expect(lastUrl.href).to.equal(WeChatMediaUrl + '?access_token=' + accessToken + '&type=image')
//                     expect(req.method).to.equal('POST')
//                     expect(req.headers['content-type']).to.startsWith('multipart/form-data; boundary=')
//                     new multiparty.Form({autoFiles: false}).parse(req, (err, fields, files) => {
//                         if(err){
//                             done(err)
//                         } else {
//                             expect(files).to.have.property('image')
//                             expect(files.image).to.be.an('array')
//                             expect(files.image).to.have.lengthOf(1)
//                             // TODO: check image bytes
//                             // expect(files.image[0]).to.equal(imageBytes)
//                             // console.log(`file: ${JSON.stringify(files.image[0], null, 4)}`)
//                             res.statusCode = 200
//                             res.setHeader('Content-Type', 'application/json')
//                             res.end(JSON.stringify({
//                                 type: 'image',
//                                 media_id,
//                                 created_at: 123456789
//                             }))
//                         }
//                     })
//                 },
//                 (req, res) => {
//                     expect(lastUrl.href).to.equal(WeChatApiUrl + '?access_token=' + accessToken)
//                     expect(req.method).to.equal('POST')
//                     expect(req.headers['content-type']).to.equal('application/json')
//                     jsonBody(req, (err, body) => {
//                         if(err){
//                             done(err)
//                         } else {
//                             expect(body).to.deep.equal(msg)
//                             res.statusCode = 200
//                             res.end('ok')
//                         }
//                     })
//                 },
//             ]
//             mitm.on('connect', (sock, opts) => {
//                 lastUrl = opts.url || opts.uri
//             }).on('request', (req, res) => {
//                 if(!interceptors){
//                     throw new Error('unexpected request')
//                 }
//                 interceptors.shift()(req, res)
//             })
//             wc.sendPhoto(userId, fileUrl, err => {
//                 expect(interceptors).to.be.empty
//                 done(err)
//             })
//         })
//
//     })
//
//     describe('receive text message', () => {
//
//         const wc = new WeChatApi({appId, appSecret}, express_app)
//         wc.accessToken = accessToken
//
//         it('should emit text event on text message', done => {
//             const message_id = '1234567890123456'
//             const chat_id = 'fromUser'
//             const text = 'this is a test'
//             const msgXml = `
//             <xml>
//                 <ToUserName><![CDATA[toUser]]></ToUserName>
//                 <FromUserName><![CDATA[${chat_id}]]></FromUserName>
//                 <CreateTime>1348831860</CreateTime>
//                 <MsgType><![CDATA[text]]></MsgType>
//                 <Content><![CDATA[${text}]]></Content>
//                 <MsgId>${message_id}</MsgId>
//             </xml>
//             `
//             const expected = {
//                 message_id,
//                 chat_id,
//                 text,
//                 from: {
//                     name: chat_id
//                 }
//             }
//             wc.on('text', msg => {
//                 expect(msg).to.deep.equal(expected)
//                 done()
//             })
//             try {
//                 wc._handleMessage(msgXml)
//             } catch(e){
//                 done(e)
//             }
//         })
//     })
//
//     describe('receive image message', () => {
//
//         const wc = new WeChatApi({appId, appSecret}, express_app)
//         wc.accessToken = accessToken
//
//         it('should emit image event on image message', done => {
//             const message_id = '1234567890123456'
//             const chat_id = 'fromUser'
//             const url = 'this is a url'
//             const msgXml = `
//             <xml>
//                 <ToUserName><![CDATA[toUser]]></ToUserName>
//                 <FromUserName><![CDATA[${chat_id}]]></FromUserName>
//                 <CreateTime>1348831860</CreateTime>
//                 <MsgType><![CDATA[image]]></MsgType>
//                 <PicUrl><![CDATA[${url}]]></PicUrl>
//                 <MediaId><![CDATA[media_id]]></MediaId>
//                 <MsgId>${message_id}</MsgId>
//             </xml>            `
//             const expected = {
//                 message_id,
//                 chat_id,
//                 url,
//                 from: {
//                     name: chat_id
//                 }
//             }
//             wc.on('image', msg => {
//                 expect(msg).to.deep.equal(expected)
//                 done()
//             })
//             try {
//                 wc._handleMessage(msgXml)
//             } catch(e){
//                 done(e)
//             }
//         })
//     })
//
//     describe('receive location message', () => {
//
//         const wc = new WeChatApi({appId, appSecret}, express_app)
//         wc.accessToken = accessToken
//
//         it('should emit location event on location message', done => {
//             const message_id = '1234567890123456'
//             const chat_id = 'fromUser'
//             const latitude = '23.134521'
//             const longitude = '113.358803'
//             const msgXml = `
//                 <xml>
//                     <ToUserName><![CDATA[toUser]]></ToUserName>
//                     <FromUserName><![CDATA[${chat_id}]]></FromUserName>
//                     <CreateTime>1351776360</CreateTime>
//                     <MsgType><![CDATA[location]]></MsgType>
//                     <Location_X>${latitude}</Location_X>
//                     <Location_Y>${longitude}</Location_Y>
//                     <Scale>20</Scale>
//                     <Label><![CDATA[Location]]></Label>
//                     <MsgId>${message_id}</MsgId>
//                 </xml>
//             `
//             const expected = {
//                 message_id,
//                 chat_id,
//                 location: {
//                     latitude,
//                     longitude,
//                     url: null
//                 },
//                 from: {
//                     name: chat_id
//                 }
//             }
//             wc.on('location', msg => {
//                 expect(msg).to.deep.equal(expected)
//                 done()
//             })
//             try {
//                 wc._handleMessage(msgXml)
//             } catch(e){
//                 done(e)
//             }
//         })
//     })
//
// })
