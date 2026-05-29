import { Test, TestingModule } from '@nestjs/testing';
import { EtlService } from './etl.service';

describe('EtlService', () => {
  let service: EtlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EtlService],
    }).compile();

    service = module.get<EtlService>(EtlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
