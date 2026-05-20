import { Injectable, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import * as https from 'https';

@Injectable()
export class DeviceApiService {
  private readonly logger = new Logger(DeviceApiService.name);
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });

  constructor(private readonly httpService: HttpService) {}

  // Master function for all device communication
async sendCommand(
    ipAddress: string,
    route: string,
    method: 'GET' | 'PUT' | 'POST',
    user: string,
    pass: string,
    payload?: any
  ) {
    // --- NEW LOGIC: Ensure the IP has a protocol ---
    const formattedIp = ipAddress.startsWith('http') 
      ? ipAddress 
      : `http://${ipAddress}`;

    // Now use formattedIp instead of ipAddress
    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;

    try {
      return await this.executeHttp(url, method, payload);
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const authHeader = error.response.headers['www-authenticate'];
        const digest = this.generateDigestAuth(authHeader, url, method, user, pass);
        
        return await this.executeHttp(url, method, payload, digest);
      }
      
      // I also recommend improving the error log here to catch the "Invalid URL" early next time
      throw new HttpException(
        `Device Error: ${error.message || 'Unknown network error'}`, 
        error.response?.status || 500
      );
    }
  }

  private async executeHttp(url: string, method: string, data?: any, authHeader?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method,
        data,
        headers,
        httpsAgent: this.httpsAgent,
        timeout: 4000, // 4-second timeout to prevent locking up
      })
    );
    return response.data;
  }

  private generateDigestAuth(authHeader: string, uri: string, method: string, user: string, pass: string): string {
    const getMatch = (regex: RegExp) => (authHeader.match(regex) || [])[1];
    const realm = getMatch(/realm="([^"]+)"/);
    const nonce = getMatch(/nonce="([^"]+)"/);
    const qop = getMatch(/qop="([^"]+)"/) || getMatch(/qop=([^,]+)/);

    const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');
    const ha1 = md5(`${user}:${realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    
    const response = qop 
      ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : md5(`${ha1}:${nonce}:${ha2}`);

    let digest = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) digest += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    return digest;
  }
}