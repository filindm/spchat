'use strict';


const chai = require('chai');
const expect = chai.expect;
const sessions = require('../src/sessions');


describe('sessions', () => {

    describe('takeWithPromise', () => {

        it('should work...', done => {
            const sem = sessions().findOrCreate('chat_123').sem;
            sem.takeWithPromise().then(() => {
                sem.leave();
            }).then(() => {
                done();
            }).catch(e => {
                done(e);
            })
        })
    })
})
