'use strict';

const semaphore = require('semaphore')

class SessionManager {

    constructor(){
        this.sessions = {}
    }

    findOrCreate(chat_id){
        if(!this.sessions.hasOwnProperty(chat_id)){
            this.sessions[chat_id] = {
                sem: semaphore(1)
            }
            this.sessions[chat_id].sem.takeWithPromise = () => {
                return new Promise((resolve, reject) => {
                    this.sessions[chat_id].sem.take(() => {
                        resolve();
                    })
                })
            }
        }
        return this.sessions[chat_id];
    }

    remove(chat_id){
        delete this.sessions[chat_id];
    }
}

module.exports = () => new SessionManager();
