import { Validator } from 'class-validator';
export const ServerlessValidator = new Validator();
import moment from 'moment';

export function formatDuration(time: Date, compact: boolean) {
  const timeValue = moment().diff(time);
  let result = '';
  const duration = moment.duration(timeValue);
  const suffixes = ['d', 'h', 'm'];
  const durationValues = [
    Math.round(duration.asDays()),
    duration.hours(),
    duration.minutes(),
  ];
  durationValues.forEach((value, index) => {
    if (value) result += value + suffixes[index] + ' ';
  });
  if (compact) {
    result = result.split(' ')[0];
  }
  if (!result) {
    return '<1m';
  }
  return result;
}

