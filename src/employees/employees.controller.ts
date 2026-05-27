import { Controller, Get, Post, Body, UploadedFile, UseInterceptors, Delete, Param, Patch, UseGuards, HttpException, HttpStatus, Res, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

@Controller('employees')
export class EmployeesController {
  private readonly logger = new Logger(EmployeesController.name);

  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return this.employeesService.getAllEmployees();
  }

  // --- SECURE FILE SERVING ---
  
  @Get('uploads/profiles/:filename')
  @UseGuards(JwtAuthGuard)
  getProfile(@Param('filename') filename: string, @Res() res: express.Response) {
    const filePath = join(process.cwd(), 'uploads', 'profiles', filename);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Profile not found: ${filePath}`);
      return res.status(HttpStatus.NOT_FOUND).send('Not Found');
    }
    return res.sendFile(filePath);
  }

  @Get('uploads/snapshots/:filename')
  @UseGuards(JwtAuthGuard)
  getSnapshot(@Param('filename') filename: string, @Res() res: express.Response) {
    const filePath = join(process.cwd(), 'uploads', 'snapshots', filename);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Snapshot not found: ${filePath}`);
      return res.status(HttpStatus.NOT_FOUND).send('Not Found');
    }
    return res.sendFile(filePath);
  }

  @Get('uploads/success/:filename')
  @UseGuards(JwtAuthGuard)
  getSuccessSnapshot(@Param('filename') filename: string, @Res() res: express.Response) {
    const filePath = join(process.cwd(), 'uploads', 'success', filename);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Success snapshot not found: ${filePath}`);
      return res.status(HttpStatus.NOT_FOUND).send('Not Found');
    }
    return res.sendFile(filePath);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('photo'))
  async register(
    @Body('name') name: string,
    @Body('employeeNo') employeeNo: string,
    @Body('gender') gender: 'male' | 'female' | 'unknown',
    @UploadedFile() photo: Express.Multer.File,
  ) {
    if (!name || !employeeNo || !photo) {
      throw new HttpException('Name, Employee ID, and Photo are required', HttpStatus.BAD_REQUEST);
    }
    return this.employeesService.registerEmployee(name, employeeNo, gender || 'unknown', photo);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteEmployee(@Param('id') id: string) {
    return this.employeesService.deleteEmployee(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateEmployee(@Param('id') id: string, @Body() data: { name?: string; gender?: 'male' | 'female' | 'unknown' }) {
    return this.employeesService.updateEmployee(id, data);
  }
}
