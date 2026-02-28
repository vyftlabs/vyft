export class VyftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends VyftError {}

export class CliError extends VyftError {}
