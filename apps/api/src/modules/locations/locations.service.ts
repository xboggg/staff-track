import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class LocationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    organizationId: string;
    timezone?: string;
    floor?: string;
    building?: string;
  }) {
    return this.db.location.create({ data });
  }

  async findAll(organizationId: string) {
    return this.db.location.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const location = await this.db.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async update(id: string, data: Partial<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    isActive: boolean;
  }>) {
    await this.findById(id);
    return this.db.location.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db.location.delete({ where: { id } });
    return { message: 'Location deleted' };
  }

  isWithinGeofence(
    userLat: number,
    userLng: number,
    locationLat: number,
    locationLng: number,
    radiusMeters: number,
  ): boolean {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(userLat - locationLat);
    const dLng = this.toRad(userLng - locationLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(locationLat)) *
        Math.cos(this.toRad(userLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= radiusMeters;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
