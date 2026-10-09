import { renderComponent } from 'ngx-json-render/testing';
import {
  BarChartComponent,
  LineChartComponent,
  formatValue,
  axisTop,
} from './charts';
import { MetricComponent } from './components';

describe('chart helpers', () => {
  it('formats values compactly per format', () => {
    expect(formatValue(82000, 'currency')).toBe('$82K');
    expect(formatValue(1240000, 'currency')).toBe('$1.2M');
    expect(formatValue(3.4, 'percent')).toBe('3.4%');
    expect(formatValue(8412)).toBe('8.4K');
  });

  it('tops the axis at four round steps', () => {
    expect(axisTop(108000)).toBe(120000);
    expect(axisTop(92)).toBe(100);
    expect(axisTop(3)).toBe(4);
    expect(axisTop(0)).toBe(4);
    expect(axisTop(Number.NaN)).toBe(4);
  });
});

describe('LineChartComponent', () => {
  const labels = ['W1', 'W2', 'W3', 'W4'];

  it('draws nothing broken from a half-streamed spec', async () => {
    // Labels arrived, series did not: an empty plot, not an exception.
    const chart = await renderComponent(LineChartComponent, {
      props: { labels },
    });
    expect(chart.findAll('path.line')).toHaveLength(0);
    expect(chart.texts('text.axis')).toContain('W1');
  });

  it('keeps the x axis fixed while a series grows', async () => {
    const chart = await renderComponent(LineChartComponent, {
      props: {
        labels,
        series: [{ name: 'This year', values: [10, 20] }],
      },
    });
    const segments = () =>
      chart.find('path.line').getAttribute('d')!.split('L').length;
    const endX = () => Number(chart.find('circle.dot').getAttribute('cx'));
    expect(segments()).toBe(2);
    const halfway = endX();

    await chart.patchProps({
      series: [{ name: 'This year', values: [10, 20, 30, 40] }],
    });
    expect(segments()).toBe(4);
    // The end moved right along the same scale instead of the axis
    // stretching to fit the points that exist.
    expect(endX()).toBeGreaterThan(halfway);
    // One series names itself through the card title: no legend.
    expect(chart.findAll('.legend')).toHaveLength(0);
  });

  it('shows a legend and a data table for two series, and ignores junk', async () => {
    const chart = await renderComponent(LineChartComponent, {
      props: {
        labels,
        series: [
          { name: 'This year', values: [1, 2, 'x', 3] },
          { name: 'Last year', values: [1, 1, 1, 1] },
        ],
        format: 'percent',
      },
    });
    expect(chart.texts('.legend li')).toEqual(['This year', 'Last year']);
    expect(chart.findAll('path.line')).toHaveLength(2);
    expect(chart.texts('table th')).toContain('Last year');
    expect(chart.texts('text.axis')).toContain('3%');
  });

  it('shows a tooltip for the point under the pointer', async () => {
    const chart = await renderComponent(LineChartComponent, {
      props: {
        labels,
        series: [{ name: 'Revenue', values: [100, 200, 300, 400] }],
        format: 'currency',
      },
    });
    const svg = chart.find('svg') as unknown as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;

    // Fallback width 560, padding 44/16: the last point sits at x = 544.
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 540 }));
    await chart.fixture.whenStable();
    expect(chart.text('.tooltip')).toContain('W4');
    expect(chart.text('.tooltip')).toContain('$400');

    // Left of the first point by more than half a step: outside the data.
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: -200 }));
    await chart.fixture.whenStable();
    expect(chart.findAll('.tooltip')).toHaveLength(0);

    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 540 }));
    svg.dispatchEvent(new MouseEvent('pointerleave'));
    await chart.fixture.whenStable();
    expect(chart.findAll('.tooltip')).toHaveLength(0);
  });
});

describe('BarChartComponent', () => {
  it('adds a bar only once its value has streamed in', async () => {
    const bars = await renderComponent(BarChartComponent, {
      props: { labels: ['North', 'South', 'East'], values: [] },
    });
    expect(bars.findAll('.bar-row')).toHaveLength(0);

    await bars.patchProps({ values: [200, 100], format: 'currency' });
    expect(bars.texts('.bar-label')).toEqual(['North', 'South']);
    expect(bars.texts('.bar-value')).toEqual(['$200', '$100']);
    expect(bars.findAll('.bar-fill')[1].style.transform).toBe('scaleX(0.5)');
  });
});

describe('MetricComponent', () => {
  it('draws a sparkline only for a trend of two or more points', async () => {
    const metric = await renderComponent(MetricComponent, {
      props: { label: 'Revenue', value: '$1.24M', trend: [5] },
    });
    expect(metric.findAll('svg.spark')).toHaveLength(0);

    await metric.patchProps({ trend: [1, 3, 2] });
    expect(metric.find('svg.spark path').getAttribute('d')).toMatch(/^M0,/);
  });
});
