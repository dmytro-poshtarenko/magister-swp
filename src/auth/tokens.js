import jwt from 'jsonwebtoken';

export function createTokens({
  secret = process.env.JWT_SECRET,
  expiresIn = Number(process.env.JWT_EXPIRES_IN) || 3600,
} = {}) {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET має містити щонайменше 32 символи');
  }

  return {
    expiresIn,

    sign(user) {
      return jwt.sign({ role: user.role }, secret, {
        algorithm: 'HS256',
        subject: String(user.id),
        expiresIn,
      });
    },

    // Pinning the algorithm stops a token signed with "none" or another
    // algorithm from passing the check.
    verify(token) {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      return { id: Number(payload.sub), role: payload.role };
    },
  };
}
