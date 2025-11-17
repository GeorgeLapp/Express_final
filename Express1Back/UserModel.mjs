export class UserModel {
  constructor({ id, tg_id, balance = 0, attempts = 0, shown_events = [] }) {
    this.id = id;
    this.tg_id = tg_id;
    this.balance = balance;
    this.attempts = attempts;
    this.shown_events = shown_events;
  }
} 