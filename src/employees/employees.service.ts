import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceApiService } from '../shared/device-api/device-api.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);
  private readonly profileDir = path.join(process.cwd(), 'uploads', 'profiles');

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceApi: DeviceApiService,
  ) {
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
  }

  async registerEmployee(name: string, employeeNo: string, gender: 'male' | 'female' | 'unknown', photo: Express.Multer.File) {
    const fileExt = path.extname(photo.originalname);
    const filename = `profile_${employeeNo}${fileExt}`;
    const filePath = path.join(this.profileDir, filename);
    const dbPath = `/uploads/profiles/${filename}`;

    fs.writeFileSync(filePath, photo.buffer);

    const person = await this.prisma.person.upsert({
      where: { employeeNo },
      update: { name, gender, photo_path: dbPath, last_synced_at: new Date() },
      create: { employeeNo, name, gender, photo_path: dbPath },
    });

    await this.pushToHardware(person, photo.buffer);
    return person;
  }

  private async pushToHardware(person: any, photoBuffer: Buffer) {
    const gates = await this.prisma.gate.findMany({
      where: { ip_address: { not: '' }, username: { not: '' }, password: { not: '' } },
    });

    for (const gate of gates) {
      if (gate.ip_address === '192.168.1.102') continue;

      try {
        // --- STEP 1: USER INFO (UPSERT) ---
        this.logger.log(`[Hardware] Step 1: Syncing UserInfo ${person.name}...`);
        const userInfoPayload = {
          UserInfo: {
            employeeNo: person.employeeNo,
            name: person.name,
            gender: person.gender,
            userType: 'normal',
            doorNo: 1,
            Valid: { enable: true, beginTime: '2025-01-01T00:00:00', endTime: '2035-01-01T00:00:00' }
          }
        };

        try {
          await this.deviceApi.sendCommand(gate.ip_address, '/ISAPI/AccessControl/UserInfo/Record?format=json', 'POST', gate.username, gate.password, userInfoPayload);
        } catch (e) {
          await this.deviceApi.sendCommand(gate.ip_address, '/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', gate.username, gate.password, userInfoPayload);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // --- STEP 2: FACE ATTACHMENT (Final Attempt with Multipart PUT) ---
        this.logger.log(`[Hardware] Step 2: Attaching Face via Multipart PUT...`);
        
        // Structure: Wrapped JSON requested by Hikvision V4.x Biometrics
        const faceMetadata = JSON.stringify({
          FaceDataRecord: {
            faceLibType: "normal",
            FDID: "1",
            FPID: person.employeeNo
          }
        });

        const faceResponse = await this.deviceApi.sendMultipart(
          gate.ip_address,
          '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
          gate.username,
          gate.password,
          faceMetadata, 
          photoBuffer
        );

        this.logger.log(`[Hardware] SUCCESS! Face officially linked for ${person.name}`);

      } catch (err: any) {
        this.logger.error(`[Hardware] FAIL: ${err.message}`);
      }
    }
  }

  async getAllEmployees() {
    return this.prisma.person.findMany({ where: { userType: 'normal' }, orderBy: { name: 'asc' } });
  }

  async deleteEmployee(employeeNo: string) {
    const person = await this.prisma.person.findUnique({ where: { employeeNo } });
    if (!person) throw new HttpException('Employee not found', HttpStatus.NOT_FOUND);

    const gates = await this.prisma.gate.findMany();
    for (const gate of gates) {
      if (gate.ip_address === '192.168.1.102') continue;
      try {
        await this.deviceApi.sendCommand(gate.ip_address, '/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', gate.username, gate.password, {
          UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] }
        });
      } catch (err: any) {
        this.logger.error(`[Hardware Delete] Failed for ${gate.name}: ${err.message}`);
      }
    }

    try {
      // 1. Delete physical photo file if exists
      if (person.photo_path) {
        const absolutePath = path.join(process.cwd(), person.photo_path);
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
          this.logger.log(`[Storage] Deleted physical photo: ${person.photo_path}`);
        }
      }

      // 2. Delete from database
      await this.prisma.person.delete({ where: { employeeNo } });
      this.logger.log(`[Database] Deleted employee: ${employeeNo}`);
    } catch (e) {
      this.logger.warn(`Preserved ${employeeNo} in DB (history logs likely exist)`);
    }

    return { success: true };
  }

  async updateEmployee(employeeNo: string, data: { name?: string; gender?: 'male' | 'female' | 'unknown' }) {
    const person = await this.prisma.person.update({
      where: { employeeNo },
      data: { ...data, last_synced_at: new Date() },
    });

    // Push update to hardware
    const gates = await this.prisma.gate.findMany({
      where: { ip_address: { not: '' }, username: { not: '' }, password: { not: '' } },
    });

    for (const gate of gates) {
      if (gate.ip_address === '192.168.1.102') continue;
      try {
        const payload = {
          UserInfo: {
            employeeNo: person.employeeNo,
            name: person.name,
            gender: person.gender,
            userType: 'normal',
            doorNo: 1,
            Valid: { enable: true, beginTime: '2025-01-01T00:00:00', endTime: '2035-01-01T00:00:00' }
          }
        };
        await this.deviceApi.sendCommand(gate.ip_address, '/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', gate.username, gate.password, payload);
      } catch (err: any) {
        this.logger.error(`[Hardware Update] Failed for ${gate.name}: ${err.message}`);
      }
    }

    return person;
  }
}
