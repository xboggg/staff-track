import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class HolidaysService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: { name: string; date: string; isRecurring?: boolean; countryCode?: string }) {
    const existing = await this.db.holiday.findUnique({
      where: { date_countryCode: { date: new Date(data.date), countryCode: data.countryCode || 'GH' } },
    });
    if (existing) throw new ConflictException('Holiday already exists for this date');

    return this.db.holiday.create({
      data: {
        name: data.name,
        date: new Date(data.date),
        isRecurring: data.isRecurring ?? false,
        countryCode: data.countryCode || 'GH',
      },
    });
  }

  async findAll(countryCode?: string) {
    return this.db.holiday.findMany({
      where: countryCode ? { countryCode } : undefined,
      orderBy: { date: 'asc' },
    });
  }

  async update(id: string, data: Partial<{ name: string; date: string; isRecurring: boolean }>) {
    const holiday = await this.db.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return this.db.holiday.update({
      where: { id },
      data: {
        ...data,
        ...(data.date && { date: new Date(data.date) }),
      },
    });
  }

  async delete(id: string) {
    const holiday = await this.db.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return this.db.holiday.delete({ where: { id } });
  }

  async seedGhanaHolidays(year: number) {
    const holidays = [
      { name: "New Year's Day", date: `${year}-01-01` },
      { name: 'Constitution Day', date: `${year}-01-07` },
      { name: 'Independence Day', date: `${year}-03-06` },
      { name: 'Good Friday', date: this.getEasterDate(year, -2) },
      { name: 'Easter Monday', date: this.getEasterDate(year, 1) },
      { name: 'May Day', date: `${year}-05-01` },
      { name: 'Africa Unity Day', date: `${year}-05-25` },
      { name: 'Republic Day', date: `${year}-07-01` },
      { name: "Founder's Day", date: `${year}-08-04` },
      { name: 'Kwame Nkrumah Memorial Day', date: `${year}-09-21` },
      { name: 'Farmers Day', date: this.getFirstFriday(year, 11) },
      { name: 'Christmas Day', date: `${year}-12-25` },
      { name: 'Boxing Day', date: `${year}-12-26` },
    ];

    let created = 0;
    for (const h of holidays) {
      try {
        await this.db.holiday.upsert({
          where: { date_countryCode: { date: new Date(h.date), countryCode: 'GH' } },
          create: { name: h.name, date: new Date(h.date), isRecurring: true, countryCode: 'GH' },
          update: { name: h.name },
        });
        created++;
      } catch { /* skip duplicates */ }
    }
    return { seeded: created, year };
  }

  // Compute Easter Sunday using Anonymous Gregorian algorithm
  private getEasterDate(year: number, offset: number): string {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(year, month - 1, day + offset);
    return easter.toISOString().split('T')[0];
  }

  private getFirstFriday(year: number, month: number): string {
    const date = new Date(year, month, 1);
    while (date.getDay() !== 5) date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }
}
