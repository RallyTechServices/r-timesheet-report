Ext.define('TSTimesheetFinanceRow',{
    extend: 'Ext.data.Model',
    
    fields: [
        { name: '_User', type:'object' },
        { name: '_WeekStartString', type:'string' },
        { name: 'DateVal', type: 'date' },
        { name: 'Hours', type: 'float' },
        { name: 'TimeEntryItem', type:'object'},
        { name: '_TopLevelParent', type:'object'}
    ]
});
