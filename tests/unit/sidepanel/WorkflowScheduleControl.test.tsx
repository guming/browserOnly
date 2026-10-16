import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowScheduleControl } from '../../../src/sidepanel/components/WorkflowScheduleControl';
const workflow: any = { id:'w', status:'active' };
test('configures weekly frequency and time from the compact schedule controls', async () => {
 const updated = jest.fn();
 jest.spyOn(chrome.tabs,'query').mockResolvedValue([{id:1,windowId:2}] as any);
 const send = jest.spyOn(chrome.runtime,'sendMessage').mockResolvedValue({success:true,workflow});
 render(<WorkflowScheduleControl workflow={workflow} onUpdated={updated}/>);
 fireEvent.click(screen.getByRole('button',{name:'Schedule'}));
 fireEvent.change(screen.getByLabelText('Schedule frequency'),{target:{value:'weekly'}});
 fireEvent.change(screen.getByLabelText('Schedule time'),{target:{value:'09:30'}});
 fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));
 await waitFor(()=>expect(send).toHaveBeenCalledWith(expect.objectContaining({operation:'save',ownerTabId:1,schedule:{frequency:'weekly',time:'09:30',weekday:1}})));
 expect(updated).toHaveBeenCalled();
});
test('shows next execution and sends pause without changing the frequency',async()=>{
 const send=jest.spyOn(chrome.runtime,'sendMessage').mockResolvedValue({success:true,workflow});
 render(<WorkflowScheduleControl workflow={{...workflow,schedule:{status:'active',frequency:'daily',nextRunAt:Date.now()+3600000}}}/>);
 expect(screen.getByText(/Next run:/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Pause'}));
 await waitFor(()=>expect(send).toHaveBeenCalledWith(expect.objectContaining({operation:'pause'})));
});
