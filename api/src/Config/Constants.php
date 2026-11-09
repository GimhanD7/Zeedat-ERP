<?php
declare(strict_types=1);

namespace Zeedat\Config;

class Constants {
    public const ROLES = [
        'owner' => 'Owner',
        'manager' => 'Branch Manager',
        'cashier' => 'Cashier',
        'technician' => 'Technician',
        'stock' => 'Inventory Staff',
    ];

    public const SELLERS = ['owner', 'manager', 'cashier'];
    public const MANAGERS = ['owner', 'manager'];
    public const STOCK_ROLES = ['owner', 'manager', 'stock'];
    public const TENDERS = ['Cash', 'Card', 'Bank Transfer', 'Koko'];

    public const REPAIR_TRANSITIONS = [
        'Received' => ['Diagnosing', 'Cancelled'],
        'Diagnosing' => ['Awaiting Approval', 'Waiting for Parts', 'In Progress', 'Cancelled'],
        'Awaiting Approval' => ['Waiting for Parts', 'In Progress', 'Cancelled'],
        'Waiting for Parts' => ['In Progress', 'Cancelled'],
        'In Progress' => ['Waiting for Parts', 'Testing', 'Cancelled'],
        'Testing' => ['In Progress', 'Ready'],
        'Ready' => ['Delivered', 'In Progress'],
    ];
}
