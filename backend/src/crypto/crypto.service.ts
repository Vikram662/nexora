import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private masterKey!: Buffer;

  onModuleInit() {
    const rawKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!rawKey) {
      throw new Error(
        'FATAL: ENCRYPTION_MASTER_KEY environment variable is missing. ' +
        'Refusing to start service with insecure defaults. ' +
        'Generate a 32-byte hex key using `openssl rand -hex 32`.'
      );
    }

    const keyBuf = Buffer.from(rawKey, 'hex');
    if (keyBuf.length !== 32) {
      throw new Error(
        `FATAL: ENCRYPTION_MASTER_KEY must be exactly 32 bytes (64 hex characters). Received ${keyBuf.length} bytes.`
      );
    }

    this.masterKey = keyBuf;
  }

  // Encrypt secrets (BYOS, BYOF, AI API keys)
  encrypt(text: string): { ciphertext: string; iv: string; authTag: string } {
    if (!this.masterKey) {
      this.onModuleInit();
    }
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
    if (!this.masterKey) {
      this.onModuleInit();
    }
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

  // Hash developer API secret or passwords
  async hashApiSecret(secret: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(secret, salt);
  }

  // Verify developer API secret against stored hash
  async verifyApiSecret(secret: string, hash: string): Promise<boolean> {
    return bcrypt.compare(secret, hash);
  }
}
