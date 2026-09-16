/**
 * [module: frontend]
 * The block that turns a goal's finished tasks into files someone can open.
 *
 * Two things are easy to get wrong here and both are silent. It can find
 * nothing and render nothing, which on a surface with no other result block
 * reads as "the goal produced nothing" rather than "we could not resolve it" -
 * hence `fallback`. And its own group dispatch is driven by deliverable_type,
 * so a task with no type at all still has to come out as a document.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import FinalResultsSection from './FinalResultsSection';

const theme = createTheme();

const doneTask = (over = {}) => ({
  id: 't1',
  title: 'Risk Matrix',
  status: 'done',
  sequence_order: 0,
  data: { output: '# Risk matrix\n\nNine mitigations.' },
  ...over,
});

function setup(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <FinalResultsSection tasks={[]} goalId={null} goal={null} {...props} />
    </ThemeProvider>
  );
}

describe('FinalResultsSection', () => {
  it('renders a done task with output as a document', () => {
    setup({ tasks: [doneTask()] });
    expect(screen.getByText('Risk Matrix')).toBeInTheDocument();
    expect(screen.getByText('Final Results')).toBeInTheDocument();
  });

  it('renders nothing at all when there is nothing to show', () => {
    const { container } = setup({ tasks: [doneTask({ status: 'todo' })] });
    expect(container).toBeEmptyDOMElement();
  });

  it('hands over to the fallback rather than leaving a hole', () => {
    setup({ tasks: [], fallback: <p>Nothing we could resolve</p> });
    expect(screen.getByText('Nothing we could resolve')).toBeInTheDocument();
  });

  it('keeps the fallback out of the way when it did find something', () => {
    setup({ tasks: [doneTask()], fallback: <p>Nothing we could resolve</p> });
    expect(screen.getByText('Risk Matrix')).toBeInTheDocument();
    expect(screen.queryByText('Nothing we could resolve')).not.toBeInTheDocument();
  });
});
