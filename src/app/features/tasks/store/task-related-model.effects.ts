import {Injectable} from '@angular/core';
import {Actions, Effect, ofType} from '@ngrx/effects';
import {MoveToOtherProject, TaskActionTypes, UpdateTask} from './task.actions';
import {Store} from '@ngrx/store';
import {filter, map, tap} from 'rxjs/operators';
import {PersistenceService} from '../../../core/persistence/persistence.service';
import {Task, TaskWithSubTasks} from '../task.model';
import {ReminderService} from '../../reminder/reminder.service';
import {Router} from '@angular/router';
import {selectAttachmentByIds} from '../task-attachment/store/attachment.reducer';
import {moveTaskInTodayList} from '../../work-context/store/work-context-meta.actions';


@Injectable()
export class TaskRelatedModelEffects {
  // EFFECTS ===> EXTERNAL
  // ---------------------
  @Effect({dispatch: false})
  moveToArchive$: any = this._actions$.pipe(
    ofType(
      TaskActionTypes.MoveToArchive,
    ),
    tap(this._moveToArchive.bind(this)),
    tap(this._updateLastActive.bind(this)),
  );

  @Effect({dispatch: false})
  moveToOtherProject: any = this._actions$.pipe(
    ofType(
      TaskActionTypes.MoveToOtherProject,
    ),
    tap(this._moveToOtherProject.bind(this)),
    tap(this._updateLastActive.bind(this)),
  );

  @Effect({dispatch: false})
  restoreTask$: any = this._actions$.pipe(
    ofType(
      TaskActionTypes.RestoreTask,
    ),
    tap(this._removeFromArchive.bind(this))
  );

  // EXTERNAL ===> TASKS
  // -------------------
  @Effect()
  moveTaskToUnDone$: any = this._actions$.pipe(
    ofType(
      moveTaskInTodayList,
    ),
    filter(({src, target}) => src === 'DONE' && target === 'UNDONE'),
    map(({taskId}) => new UpdateTask({
      task: {
        id: taskId,
        changes: {
          isDone: false,
        }
      }
    }))
  );

  @Effect()
  moveTaskToDone$: any = this._actions$.pipe(
    ofType(
      moveTaskInTodayList,
    ),
    filter(({src, target}) => src === 'UNDONE' && target === 'DONE'),
    map(({taskId}) => new UpdateTask({
      task: {
        id: taskId,
        changes: {
          isDone: true,
        }
      }
    }))
  );

  constructor(
    private _actions$: Actions,
    private _store$: Store<any>,
    private _reminderService: ReminderService,
    private _router: Router,
    private _persistenceService: PersistenceService
  ) {
  }

  private _updateLastActive() {
    this._persistenceService.saveLastActive();
  }

  private async _getTaskRelatedDataForTask(task: Task) {
    const ids = task.attachmentIds;
    const attachments = await this._store$.select(selectAttachmentByIds, {ids}).toPromise();
  }

  private async _removeRelatedDataForTask(task: Task) {
    const ids = task.attachmentIds;
    const attachments = await this._store$.select(selectAttachmentByIds, {ids}).toPromise();
  }

  private _removeFromArchive([action]) {
    const task = action.payload.task;
    const taskIds = [task.id, ...task.subTaskIds];
    this._persistenceService.removeTasksFromArchive(taskIds);
  }

  private _moveToArchive([action]) {
    const mainTasks = action.payload.tasks as TaskWithSubTasks[];
    const archive = {
      entities: {},
      ids: []
    };
    mainTasks.forEach((task: TaskWithSubTasks) => {
      const {subTasks, ...taskWithoutSub} = task;
      archive.entities[task.id] = {
        ...taskWithoutSub,
        reminderId: undefined,
        isDone: true,
      };
      if (taskWithoutSub.reminderId) {
        this._reminderService.removeReminder(taskWithoutSub.reminderId);
      }

      archive.ids.push(taskWithoutSub.id);
      if (task.subTasks) {
        task.subTasks.forEach((subTask) => {
          archive.entities[subTask.id] = {
            ...subTask,
            reminderId: undefined,
            isDone: true,
          };
          archive.ids.push(subTask.id);
          if (subTask.reminderId) {
            this._reminderService.removeReminder(subTask.reminderId);
          }
        });
      }
    });

    this._persistenceService.addTasksToArchive(archive);
  }

  private _moveToOtherProject(action: MoveToOtherProject) {
    const mainTasks = action.payload.tasks as TaskWithSubTasks[];
    const projectId = action.payload.projectId;
    mainTasks.forEach((task: TaskWithSubTasks) => {
      if (task.reminderId) {
        this._reminderService.updateReminder(task.reminderId, {projectId});
      }

      if (task.subTasks) {
        task.subTasks.forEach((subTask) => {
          if (subTask.reminderId) {
            this._reminderService.updateReminder(subTask.reminderId, {projectId});
          }
        });
      }
    });

    this._persistenceService.saveTasksToProject(projectId, mainTasks);
  }

}


