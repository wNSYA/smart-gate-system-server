import { Controller, Get, Post, Body, UploadedFile, UseInterceptors, Delete, Param, Patch, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async findAll() {
    return this.employeesService.getAllEmployees();
  }

  @Post('register')
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
  async deleteEmployee(@Param('id') id: string) {
    return this.employeesService.deleteEmployee(id);
  }

  @Patch(':id')
  async updateEmployee(@Param('id') id: string, @Body() data: { name?: string; gender?: 'male' | 'female' | 'unknown' }) {
    return this.employeesService.updateEmployee(id, data);
  }
}
