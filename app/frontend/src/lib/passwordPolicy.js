export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_REQUIREMENTS = [
  ['length', `At least ${PASSWORD_MIN_LENGTH} characters`, (value) => value.length >= PASSWORD_MIN_LENGTH],
  ['lowercase', 'A lowercase letter', (value) => /[a-z]/.test(value)],
  ['uppercase', 'An uppercase letter', (value) => /[A-Z]/.test(value)],
  ['number', 'A number', (value) => /\d/.test(value)],
  ['special', 'A special character', (value) => /[^A-Za-z0-9]/.test(value)],
]

export function passwordRequirements(password) {
  return PASSWORD_REQUIREMENTS.map(([id, label, test]) => ({ id, label, met: test(password) }))
}

export function isPasswordValid(password) {
  return passwordRequirements(password).every((requirement) => requirement.met)
}
