interface TestConfigOut {
  channels: [ChannelInfo];
}
interface ChannelInfo {
  steps: [Step | DriveCycle];
  info: {
    testId: string;
    overallMultiplier: number;
    isConAmTe: boolean;
    ambTemp: number;
    noOfSubExp: number;
  };
}
interface Step {
  mode: number | null;
  currentRate: number | null;
  resVal: number | null;
  powVal: number | null;
  timeLimit: number | null;
  voltLimit: number | null;
  total_n_samples:number | null;
  multiplier: number | null;
  ambTemp: number | null;
  holdVolt: number | null;
}
interface DriveCycle {
  timeStep: [number];
  value: [number];
  valueType: "Current" | "Power";
}

const myConfig = {
  channels: [
    {
      steps: [
        {
          mode: 1,
          currentRate: 0.5,
          resVal: null,
          powVal: null,
          timeLimit: 60,
          voltLimit:null,
          multiplier: 1,
          ambTemp: null,
          holdVolt: null,
        },
        {
          timeStep: [0, 30, 60],
          value: [0, 2, 0],
          valueType: "Current",
        },
      ],
      info: {
        testId: "myTestId",
        overallMultiplier: 2,
        isConAmTe: true,
        ambTemp: 25,
        noOfSubExp: 3,
      },
    },
  ],
};
