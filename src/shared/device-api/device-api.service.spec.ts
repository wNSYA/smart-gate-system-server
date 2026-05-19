import { Test, TestingModule } from '@nestjs/testing';
import { DeviceApiService } from './device-api.service';

describe('DeviceApiService', () => {
  let service: DeviceApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceApiService],
    }).compile();

    service = module.get<DeviceApiService>(DeviceApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
