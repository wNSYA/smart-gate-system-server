import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import * as https from 'https';

@Injectable()
export class DeviceApiService {
  private readonly logger = new Logger(DeviceApiService.name);
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });

  constructor(private readonly httpService: HttpService) {}

  async sendCommand(
    ipAddress: string,
    route: string,
    method: 'GET' | 'PUT' | 'POST',
    user: string,
    pass: string,
    payload?: any
  ) {
    const formattedIp = ipAddress.startsWith('http') ? ipAddress : `http://${ipAddress}`;
    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;

    const execute = async (auth?: string) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) headers['Authorization'] = auth;

      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method,
          data: payload,
          headers,
          httpsAgent: this.httpsAgent,
          timeout: 60000,
        })
      );
      return response.data;
    };

    try {
      return await execute();
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const digest = this.generateDigestAuth(error.response.headers['www-authenticate'], url, method, user, pass);
        try {
          return await execute(digest);
        } catch (retryError: any) {
          throw this.formatError(retryError);
        }
      }
      throw this.formatError(error);
    }
  }

  async sendMultipart(
    ipAddress: string,
    route: string,
    user: string,
    pass: string,
    jsonString: string,
    fileBuffer: Buffer
  ) {
    const formattedIp = ipAddress.startsWith('http') ? ipAddress : `http://${ipAddress}`;
    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
    const boundary = `----HikvisionISAPIBoundary${crypto.randomBytes(4).toString('hex')}`;

    // --- GHOST MULTIPART STRATEGY ---
    // Minimal headers for the metadata part, as V4.x often chokes on internal content-types
    const part1 = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="faceDataRecord"\r\n\r\n` + // No Content-Type!
      `${jsonString}\r\n`;

    const part2Headers = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;

    const footer = `\r\n--${boundary}--\r\n`;

    const payloadBuffer = Buffer.concat([
      Buffer.from(part1, 'utf8'),
      Buffer.from(part2Headers, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    const execute = async (auth?: string) => {
      const headers: Record<string, string> = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payloadBuffer.length.toString(),
        'Connection': 'keep-alive'
      };
      if (auth) headers['Authorization'] = auth;

      const response = await firstValueFrom(
        this.httpService.post(url, payloadBuffer, {
          headers,
          httpsAgent: this.httpsAgent,
          timeout: 60000,
        })
      );
      return response.data;
    };

    try {
      return await execute();
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const digest = this.generateDigestAuth(error.response.headers['www-authenticate'], url, 'POST', user, pass);
        try {
          return await execute(digest);
        } catch (retryError: any) {
          throw this.formatError(retryError);
        }
      }
      throw this.formatError(error);
    }
  }

  private formatError(error: any): Error {
    if (error.response && error.response.data) {
      const body = error.response.data;
      const detail = typeof body === 'string' ? body : JSON.stringify(body);
      return new Error(`[ISAPI ${error.response.status}] Body: ${detail}`);
    }
    return new Error(error.message || 'Unknown network error');
  }

  async downloadBinary(ipAddress: string, route: string, user: string, pass: string): Promise<Buffer> {
    const formattedIp = ipAddress.startsWith('http') ? ipAddress : `http://${ipAddress}`;
    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
    
    const execute = async (auth?: string) => {
       const headers = auth ? { 'Authorization': auth } : {};
       const response = await firstValueFrom(
         this.httpService.get(url, { headers, responseType: 'arraybuffer', httpsAgent: this.httpsAgent, timeout: 30000 })
       );
       return Buffer.from(response.data);
    };

    try {
      return await execute();
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const digest = this.generateDigestAuth(error.response.headers['www-authenticate'], url, 'GET', user, pass);
        return await execute(digest);
      }
      throw error;
    }
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
    const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
    let digest = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) digest += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    return digest;
  }
}
