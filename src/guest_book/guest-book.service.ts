import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuestBookService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // GET ALL GUEST BOOK DATA
  // ─────────────────────────────────────────────
async getAllGuestBooks() {
  return this.prisma.guest_book.findMany({
    orderBy: {
      created_at: 'desc',
    },
  });
}

  // ─────────────────────────────────────────────
  // CREATE NEW GUEST BOOK ENTRY
  // ─────────────────────────────────────────────
  async createGuestBook(body: any) {
    return this.prisma.guest_book.create({
      data: {
        guestName: body.guestName,
        companyName: body.companyName,
        purpose: body.purpose,
        activity: body.activity,

        visitorCount: body.visitorCount || 1,

        checkInTime: body.checkInTime
          ? new Date(body.checkInTime)
          : new Date(),

        checkOutTime: body.checkOutTime
          ? new Date(body.checkOutTime)
          : null,
      },
    });
  }

  // ─────────────────────────────────────────────
  // CHECKOUT VISITOR
  // ─────────────────────────────────────────────
  async checkoutVisitor(id: number) {
    return this.prisma.guest_book.update({
      where: {
        id,
      },
      data: {
        checkOutTime: new Date(),
      },
    });
  }

  // ─────────────────────────────────────────────
  // DELETE GUEST BOOK ENTRY
  // ─────────────────────────────────────────────
  async removeGuestBook(id: number) {
    return this.prisma.guest_book.delete({
      where: {
        id,
      },
    });
  }
async exportGuestBooks() {
  const guestBooks =
    await this.prisma.guest_book.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

  const headers = [
    'Nama Tamu',
    'Instansi',
    'Tujuan',
    'Aktivitas',
    'Jumlah Visitor',
    'Check In',
    'Check Out',
  ];

  const rows = guestBooks.map((g) => [
    g.guestName,
    g.companyName || '-',
    g.purpose || '-',
    g.activity || '-',
    g.visitorCount,
    g.checkInTime
      ? new Date(g.checkInTime).toLocaleString(
          'id-ID',
        )
      : '-',
    g.checkOutTime
      ? new Date(g.checkOutTime).toLocaleString(
          'id-ID',
        )
      : '-',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\n');

  return csv;
}
}

