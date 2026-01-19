export class UserModel {
  constructor({ id, tg_id, username = '', balance = 0, attempts = 0, shown_events = [] }) {
    this.id = id;
    this.tg_id = tg_id;
    this.username = username;
    this.balance = balance;
    this.attempts = attempts;
    this.shown_events = shown_events;
  }
} 
