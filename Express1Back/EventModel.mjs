export class EventModel {
  constructor({
    id,
    sport,
    tournament,
    team1,
    team2,
    startTime,
    outcome1,
    outcomeX,
    outcome2,
    outcome1X,
    outcomeX2,
    status
  }) {
    this.id = id;
    this.sport = sport;
    this.tournament = tournament;
    this.team1 = team1;
    this.team2 = team2;
    this.startTime = startTime;
    this.outcome1 = outcome1;
    this.outcomeX = outcomeX;
    this.outcome2 = outcome2;
    this.outcome1X = outcome1X;
    this.outcomeX2 = outcomeX2;
    this.status = status;
  }

  isValid() {
    return this.id && this.sport && this.tournament && this.team1 && this.team2 && this.startTime &&
      (this.outcome1 !== undefined) && (this.outcome2 !== undefined);
  }
} 
