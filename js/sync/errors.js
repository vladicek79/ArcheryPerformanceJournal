// Errors raised by a Drive store (real or fake) and mapped by the sync service to a status.

export class DriveConflictError extends Error {
  constructor() {
    super('The Drive file was changed by another device.');
    this.name = 'DriveConflictError';
  }
}

export class DriveAuthError extends Error {
  constructor(message = 'Google sign-in expired.') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class DriveOfflineError extends Error {
  constructor() {
    super('No connection to Google Drive.');
    this.name = 'DriveOfflineError';
  }
}

export class DriveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DriveError';
  }
}
