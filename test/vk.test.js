'use strict';


const URL = require('url').URL;

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-string'));
const nock = require('nock');
const express = require('express');
const FormData = require('form-data');

const VkChatApi = require('../src/vk').VkChatApi;
const VK_API_VERSION = require('../src/vk').VK_API_VERSION;
const vkMessagesUploadServerUrl = require('../src/vk').vkMessagesUploadServerUrl;
const vkDocsUploadServerUrl = require('../src/vk').vkDocsUploadServerUrl;
const vkMessagesSendUrl = require('../src/vk').vkMessagesSendUrl;
const vkPhotosSaveMessagesPhoto = require('../src/vk').vkPhotosSaveMessagesPhoto;
const vkDocsSaveUrl = require('../src/vk').vkDocsSaveUrl;

const groupAccessToken = 'TEST_GROUP_ACCESS_TOKEN';
const groupId = 'TEST_GROUP_ID';
const adminUserLogin = 'TEST_ADMIN_LOGIN';
const adminUserPassword = 'TEST_ADMIN_PASSWORD';


const urlHost = urlStr => {
    const url = new URL(urlStr);
    return `${url.protocol}//${url.host}`;
}

const urlPath = urlStr => {
    const url = new URL(urlStr);
    return url.pathname;
}

const streamFromString = str => {
    const Readable = require('stream').Readable;
    const s = new Readable();
    s._read = () => {}; // redundant?
    s.push(str);
    s.push(null);
    return s;
}


describe('VKontakte', () => {

    let vk;

    beforeEach(() => {
        vk = new VkChatApi({
            groupAccessToken,
            groupId,
            adminUserLogin,
            adminUserPassword,
        }, express());
    })

    describe('sendText', () => {

        it('should send correct HTTP message', done => {
            const chatId = 'chat123';
            const text = 'abc';
            nock(urlHost(vkMessagesSendUrl))
                .post(urlPath(vkMessagesSendUrl), {
                    message: text,
                })
                .query({
                    access_token: groupAccessToken,
                    user_id: chatId,
                    peer_id: groupId,
                    from_group: 1,
                    v: VK_API_VERSION,
                })
                .reply(200, {});

            vk.sendText(chatId, text).then(() => {
                expect(nock.isDone()).to.be.true;
                done();
            }).catch(e => {
                done(e);
            })
        })
    })

    describe('sendPhoto', () => {

        it('should send correct HTTP message', done => {

            const chatId = 'chat123';
            const photoContents = 'fake jpeg file contents';
            const photoUrl = 'https://test.org/someImage.jpg';
            const uploadUrl = 'https://uploadUrl.com/abc';

            // Endpoint to download photo
            nock(urlHost(photoUrl))
                .get(urlPath(photoUrl))
                .reply(200, photoContents, {
                    'Content-type': 'image/jpeg',
                });

            // VK endpoint to get upload server URL
            nock(urlHost(vkMessagesUploadServerUrl))
                .get(urlPath(vkMessagesUploadServerUrl))
                .query({
                    peer_id: chatId,
                    access_token: groupAccessToken,
                    v: VK_API_VERSION,
                })
                .reply(200, {
                    response: {
                        upload_url: uploadUrl,
                    }
                });

            // VK endpoint to upload photo
            // const formData = new FormData();
            // formData.append('photo', streamFromString(photoContents), {
            //     contentType: 'image/jpeg',
            // });
            const uploadResponse = {
                server: 626627,
                photo: 'some data here',
                hash: '581d7a4ffc81e2bfe90016d8b35c288d',
            };
            nock(urlHost(uploadUrl))
                .post(urlPath(uploadUrl), body => {
                    // console.log(`body: ${body}`);
                    // return body.indexOf(photoContents) !== -1;
                    return true;
                })
                .reply(200, uploadResponse);

            // VK endpoint to save an uploaded photo
            const uploadedPhotoId = 'photo_id_1';
            const uploadedPhotoOwnerId = '_uploaded_photo_owner_id_1';
            nock(urlHost(vkPhotosSaveMessagesPhoto))
                .post(urlPath(vkPhotosSaveMessagesPhoto), uploadResponse)
                .query({
                    // peer_id: chatId,
                    access_token: groupAccessToken,
                    v: VK_API_VERSION,
                })
                .reply(200, [{
                    id: uploadedPhotoId,
                    owner_id: uploadedPhotoOwnerId,
                }]);

            // VK endpoint to send a message
            const attachment = `photo${uploadedPhotoOwnerId}_${uploadedPhotoId}`;
            nock(urlHost(vkMessagesSendUrl))
                .post(urlPath(vkMessagesSendUrl), {
                    attachment,
                })
                .query({
                    access_token: groupAccessToken,
                    user_id: chatId,
                    peer_id: groupId,
                    from_group: 1,
                    v: VK_API_VERSION,
                })
                .reply(200, {});

            // Run the function under test
            vk.sendPhoto(chatId, photoUrl).then(() => {
                expect(nock.isDone()).to.be.true;
                done();
            }).catch(e => {
                done(e);
            })

        })
    })

    describe('sendDoc', () => {

        it('should send correct HTTP message', done => {

            const chatId = 'chat123';
            const docContents = 'fake jpeg file contents';
            const docUrl = 'https://test.org/someDoc.pdf';
            const docName = 'someDoc.pdf';
            const uploadUrl = 'https://uploadUrl.com/abc';

            // Endpoint to download doc
            nock(urlHost(docUrl))
                .get(urlPath(docUrl))
                .reply(200, docContents, {
                    'Content-type': 'application/pdf',
                });

            // VK endpoint to get upload server URL
            nock(urlHost(vkDocsUploadServerUrl))
                .get(urlPath(vkDocsUploadServerUrl))
                .query({
                    peer_id: chatId,
                    access_token: groupAccessToken,
                    v: VK_API_VERSION,
                })
                .reply(200, {
                    response: {
                        upload_url: uploadUrl,
                    }
                });

            // VK endpoint to upload doc
            const uploadResponse = {
                file: 'some file id',
            };
            nock(urlHost(uploadUrl))
                .post(urlPath(uploadUrl), body => {
                    // TODO: check request body here
                    return true;
                })
                .reply(200, uploadResponse);

            // VK endpoint to save an uploaded doc
            const uploadedDocId = 'doc_id_1';
            const uploadedDocOwnerId = '_uploaded_doc_owner_id_1';
            nock(urlHost(vkDocsSaveUrl))
                .post(urlPath(vkDocsSaveUrl), uploadResponse)
                .query({
                    access_token: groupAccessToken,
                    v: VK_API_VERSION,
                })
                .reply(200, [{
                    id: uploadedDocId,
                    owner_id: uploadedDocOwnerId,
                }]);

            // VK endpoint to send a message
            const attachment = `doc${uploadedDocOwnerId}_${uploadedDocId}`;
            nock(urlHost(vkMessagesSendUrl))
                .post(urlPath(vkMessagesSendUrl), {
                    attachment,
                })
                .query({
                    access_token: groupAccessToken,
                    user_id: chatId,
                    peer_id: groupId,
                    from_group: 1,
                    v: VK_API_VERSION,
                })
                .reply(200, {});

            // Run the function under test
            vk.sendDoc(chatId, docUrl, docName).then(() => {
                expect(nock.isDone()).to.be.true;
                done();
            }).catch(e => {
                done(e);
            })

        })
    })

})
