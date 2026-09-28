import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor() {
    const rawKey = process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.masterKey = Buffer.from(rawKey, 'hex');
  }

  // Encrypt secrets (BYOS, BYOF, AI API keys)
  encrypt(text: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  // Decrypt secrets just-in-time
  decrypt(ciphertextOrObj: string | { ciphertext: string; iv: string; authTag: string }, ivHex?: string, authTagHex?: string): string {
    let ciphertext: string;
    let ivStr: string;
    let authTagStr: string;

    if (typeof ciphertextOrObj === 'object') {
      ciphertext = ciphertextOrObj.ciphertext;
      ivStr = ciphertextOrObj.iv;
      authTagStr = ciphertextOrObj.authTag;
    } else {
      ciphertext = ciphertextOrObj;
      ivStr = ivHex || '';
      authTagStr = authTagHex || '';
    }

    const iv = Buffer.from(ivStr, 'hex');
    const authTag = Buffer.from(authTagStr, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Hash developer API secret
  async hashApiSecret(secret: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(secret, salt);
  }

  // Verify developer API secret against stored hash
  async verifyApiSecret(secret: string, hash: string): Promise<boolean> {
    return bcrypt.compare(secret, hash);
  }
}
