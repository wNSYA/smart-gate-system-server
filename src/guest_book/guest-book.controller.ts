import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Res
} from '@nestjs/common';
import * as express from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GuestBookService } from './guest-book.service';

@Controller('guest-book')
@UseGuards(JwtAuthGuard)
export class GuestBookController {
  constructor(
    private readonly guestBookService: GuestBookService,
  ) {}

  // ─────────────────────────────────────────────
  // GET ALL GUEST BOOK DATA
  // ─────────────────────────────────────────────
@Get()
getAllGuestBooks() {
  return this.guestBookService.getAllGuestBooks();
}

@Get('export')
async exportGuestBooks(
  @Res() res: express.Response,
) {
  const csvData =
    await this.guestBookService.exportGuestBooks();

  const filename = `Guest_Book_Report.csv`;

  res.setHeader(
    'Content-Type',
    'text/csv; charset=utf-8',
  );

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${filename}`,
  );

  res.status(200).send(csvData);
}

  // ─────────────────────────────────────────────
  // CREATE NEW ENTRY
  // ─────────────────────────────────────────────
  @Post()
  createGuestBook(
    @Body() body: any,
  ) {
    return this.guestBookService.createGuestBook(body);
  }

  // ─────────────────────────────────────────────
  // CHECKOUT VISITOR
  // ─────────────────────────────────────────────
  @Patch(':id/checkout')
  checkoutVisitor(
    @Param('id') id: string,
  ) {
    return this.guestBookService.checkoutVisitor(
      Number(id),
    );
  }

  // ─────────────────────────────────────────────
  // DELETE ENTRY
  // ─────────────────────────────────────────────
  @Delete(':id')
  removeGuestBook(
    @Param('id') id: string,
  ) {
    return this.guestBookService.removeGuestBook(
      Number(id),
    );
  }
}