import { Test, TestingModule } from '@nestjs/testing';
import { DoorControlController } from './door-control.controller';

describe('DoorControlController', () => {
  let controller: DoorControlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoorControlController],
    }).compile();

    controller = module.get<DoorControlController>(DoorControlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
